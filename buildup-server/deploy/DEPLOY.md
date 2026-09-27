# Build Up 서버 배포 안내 (https)

리눅스 서버 1대(Ubuntu 22.04 이상, 메모리 2GB 이상)에 **서버 + MySQL + Nginx**를 함께 올리는 기준입니다.

```
[앱] ──https──> [Nginx :443] ──> [Build Up 서버 :8080] ──> [MySQL :3306]
                                          └─ /opt/buildup/uploads (사진·첨부)
```

## 1. 내 컴퓨터에서 실행 파일 만들기

```
cd buildup-server
gradlew.bat bootJar
```

→ `build/libs/buildup-server.jar` 하나가 만들어집니다. 이 파일만 서버로 올리면 됩니다.

## 2. 서버 준비(처음 한 번)

```
sudo apt update
sudo apt install -y openjdk-17-jre-headless mysql-server nginx certbot python3-certbot-nginx
sudo useradd -r -m -d /opt/buildup buildup
```

MySQL에 DB와 계정 만들기(비밀번호는 새로 정한 긴 무작위 값):

```
sudo mysql
CREATE DATABASE buildup CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'buildup'@'localhost' IDENTIFIED BY '새_비밀번호';
GRANT ALL PRIVILEGES ON buildup.* TO 'buildup'@'localhost';
exit
```

## 3. 파일 올리기

| 이 폴더의 파일 | 서버 위치 |
|---|---|
| `build/libs/buildup-server.jar` | `/opt/buildup/buildup-server.jar` |
| `buildup.env.example` (값 채우기) | `/opt/buildup/buildup.env` (권한 600) |
| `buildup.service` | `/etc/systemd/system/buildup.service` |
| `nginx-buildup.conf` (도메인 바꾸기) | `/etc/nginx/sites-available/buildup` |
| `backup.sh` | `/opt/buildup/backup.sh` (실행 권한) |
| `firebase-key.json` (알림 키, 깃에 없음) | `/opt/buildup/firebase-key.json` (권한 600) |

```
sudo chown -R buildup:buildup /opt/buildup
sudo chmod 600 /opt/buildup/buildup.env
sudo systemctl daemon-reload
sudo systemctl enable --now buildup
```

## 4. https 연결

1. 도메인(예: `api.buildup.kr`)의 A 레코드를 서버 IP로 지정
2. Nginx 설정 켜기 + 인증서 발급

```
sudo ln -s /etc/nginx/sites-available/buildup /etc/nginx/sites-enabled/
sudo certbot --nginx -d api.buildup.kr
sudo nginx -t && sudo systemctl reload nginx
```

3. 확인: 브라우저에서 `https://api.buildup.kr/api/health` → `{"status":"ok"...}`

## 5. 앱 설정 바꾸기(https 주소가 정해진 뒤)

- 앱 `src/api/client.ts`의 `DEFAULT_BASE_URL`을 `https://api.buildup.kr/api`로 변경
  (또는 앱의 서버 설정 화면에서 직접 입력)
- `android/app/build.gradle`의 `usesCleartextTraffic`을 `"false"`로(http 차단)
- 다시 빌드해서 배포

## 6. 백업

- `backup.sh`가 매일 DB 전체와 사진·첨부 폴더를 `/opt/buildup/backups`에 저장하고 14일 지난 것은 지웁니다.
- 가능하면 백업 폴더를 다른 곳(클라우드 저장소 등)에도 복사해 두세요.
- 복구: `gunzip < db-날짜.sql.gz | mysql -u buildup -p buildup`, `tar -xzf uploads-날짜.tar.gz -C /opt/buildup`

## 7. 업데이트할 때

```
새 jar를 /opt/buildup/buildup-server.jar 에 덮어쓰기
sudo systemctl restart buildup
journalctl -u buildup -f     # 로그 확인
```

## 운영(prod) 설정이 하는 일

- DB 비밀번호 등은 파일이 아니라 환경 변수(`buildup.env`)에서 읽음
- 데모 데이터(테스트 계정)를 넣지 않음
- Nginx를 거쳐도 사진·첨부·엑셀 주소가 `https://`로 만들어짐
- 오류 응답에 서버 내부 정보를 싣지 않음
- 웹 대시보드는 `CORS_ORIGINS`에 적은 주소만 허용

---

# AWS에 배포하기(계획서 6-3·6-4: EC2 + RDS + S3)

위 1~7은 서버 1대에 다 넣는 방법이고, 계획서대로 **서버(EC2)·DB(RDS)·사진(S3)을 나누는** 방법은 아래와 같습니다.
지역은 모두 **서울(ap-northeast-2)** 로 맞춥니다.

```
[앱·웹] ─https─> [EC2: Nginx + Build Up 서버] ──> [RDS: MySQL 8]
                          │
                          └──(IAM 역할)──> [S3 버킷: 사진·첨부, 비공개]
```

## A. RDS(MySQL) 만들기
1. AWS 콘솔 → RDS → 데이터베이스 생성 → **MySQL 8.0**, 템플릿 **프리 티어**
2. DB 이름 `buildup`, 마스터 사용자 `buildup`, 비밀번호는 긴 무작위 값
3. **퍼블릭 액세스: 아니요** (EC2에서만 접속)
4. 보안 그룹: 3306 포트를 **EC2의 보안 그룹에서만** 허용
5. 만들어지면 '엔드포인트' 주소를 복사 → `DB_URL=jdbc:mysql://엔드포인트:3306/buildup?serverTimezone=Asia/Seoul&characterEncoding=UTF-8`

## B. S3 버킷 만들기
1. S3 → 버킷 만들기 → 이름 예: `buildup-photos-팀이름` → **모든 퍼블릭 액세스 차단: 켬(그대로)**
2. 앱에는 서버가 6시간짜리 임시 주소(presigned URL)를 주므로 버킷을 공개할 필요가 없습니다.

## C. EC2가 S3를 쓸 수 있게(IAM 역할) — 접속 키를 파일에 적지 않는 방법
1. IAM → 역할 만들기 → 신뢰할 엔터티 **EC2** → 아래 권한만 있는 정책을 붙임

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
    "Resource": "arn:aws:s3:::buildup-photos-팀이름/*"
  }]
}
```
2. EC2 인스턴스 → 작업 → 보안 → **IAM 역할 수정** → 위 역할 선택

## D. EC2 만들기
1. EC2 → 인스턴스 시작 → **Ubuntu 22.04**, t3.small 이상(프리 티어 t2.micro는 메모리가 부족할 수 있음)
2. 보안 그룹: 22(내 IP만), 80, 443 허용 (8080은 열지 않음 — Nginx가 넘겨줌)
3. 탄력적 IP를 붙이고, 도메인 A 레코드를 그 IP로
4. 접속 후 위 **2~4번**을 그대로 하되, MySQL은 설치하지 않습니다(`mysql-server` 빼기)

## E. 환경 변수(`/opt/buildup/buildup.env`)
```
DB_URL=jdbc:mysql://RDS엔드포인트:3306/buildup?serverTimezone=Asia/Seoul&characterEncoding=UTF-8
DB_USERNAME=buildup
DB_PASSWORD=RDS비밀번호
JWT_SECRET=무작위_48자(예: openssl rand -base64 48)
STORAGE=s3
S3_BUCKET=buildup-photos-팀이름
S3_REGION=ap-northeast-2
CORS_ORIGINS=https://웹대시보드주소
FIREBASE_KEY=/opt/buildup/firebase-key.json
SYSTEM_ADMIN_EMAIL=운영자이메일
SYSTEM_ADMIN_PASSWORD=12자이상비밀번호
```
- S3를 쓰면 `UPLOAD_DIR`·`backup.sh`의 사진 백업은 필요 없습니다(S3가 보관). DB 백업은 RDS 자동 백업(기본 7일)을 켜 두세요.
- API 문서(Swagger)는 운영에서 꺼져 있습니다. 발표 때만 `API_DOCS=true`를 추가하고 재시작하면 `https://도메인/swagger-ui.html`에서 보입니다.

## F. 비용 주의
- 프리 티어(가입 12개월)라도 **RDS·EC2를 켜 둔 시간**, 탄력적 IP(연결 안 된 상태)에 요금이 붙을 수 있습니다.
- 발표·시연이 끝나면 인스턴스를 **중지**하거나 삭제하세요. AWS 콘솔 → 결제 → **예산 알림**을 꼭 켜 두세요.
