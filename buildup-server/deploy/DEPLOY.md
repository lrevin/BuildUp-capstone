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

표는 만들지 않아도 돼요. 서버가 처음 켜질 때 Flyway가 V1~V11 마이그레이션으로 만들어요.

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

### 도메인이 없을 때(발표·시연용, http)

도메인이 없으면 인증서(https)를 받을 수 없으니, 서버 IP로 http 접속합니다. 앱은 http 접속을 허용해 두었어요.

1. `nginx-buildup.conf` 대신 아래 내용으로 `/etc/nginx/sites-available/buildup`을 만든다(certbot은 건너뜀)

```
server {
    listen 80 default_server;
    server_name _;
    client_max_body_size 200m;
    proxy_read_timeout 120s;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;
        proxy_set_header X-Forwarded-Port  $server_port;
    }
}
```

```
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -s /etc/nginx/sites-available/buildup /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

2. 확인: `http://서버IP/api/health` → `{"status":"ok"...}`
3. 앱 서버 주소: `http://서버IP/api`

> 비밀번호가 암호화되지 않고 오가므로 발표 기간에만 쓰고, 계속 운영할 거면 도메인을 붙여 https로 바꾸세요.

## 5. 최종 앱(APK) 만들기(서버 주소가 정해진 뒤)

앱 폴더에서 서버 주소만 넣어 실행하면, 설치하자마자 그 서버에 붙는 APK가 나옵니다.

```
powershell -ExecutionPolicy Bypass -File scripts\build-server-apk.ps1 -ServerUrl https://api.buildup.kr/api
```

- 도메인이 없으면 `-ServerUrl http://서버IP/api`
- 결과: 앱 폴더 위에 `BuildUp.apk` (스크립트가 끝나면 코드의 주소·데모 설정은 원래대로 돌아감)
- 이미 설치된 앱은 앱의 **서버 연결** 화면에서 주소를 바꿔도 됩니다.
- https만 쓸 거면 `android/app/build.gradle` release의 `allowHttp`를 `"false"`로 바꿔 http를 막을 수 있어요.

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

## 8. 서버가 꺼지지 않게(발표·CBT 기간 필수)

한 번만 하면 됩니다. 위에서부터 차례로.

**① 서버 프로그램이 죽어도 자동으로 다시 켜지게**: 새 `buildup.service`로 바꾸기

```
sudo cp buildup.service /etc/systemd/system/buildup.service
sudo systemctl daemon-reload
sudo systemctl enable buildup nginx      # 컴퓨터를 다시 켜도 자동 실행
sudo systemctl restart buildup
systemctl show buildup -p Restart        # Restart=always 나오면 성공
```

**② 멈춰서 응답만 안 하는 경우도 다시 켜지게**: `healthcheck.sh`

```
sudo cp healthcheck.sh /opt/buildup/healthcheck.sh
sudo chmod +x /opt/buildup/healthcheck.sh
sudo crontab -e
# 맨 아래 한 줄 추가:
* * * * * /opt/buildup/healthcheck.sh >> /opt/buildup/healthcheck.log 2>&1
```

**③ 메모리 부족으로 죽지 않게**: 스왑 2GB 만들기(t2/t3.micro처럼 메모리 1GB면 꼭)

```
free -h                                  # Swap이 0이면 아래 실행
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

**④ AWS 콘솔에서 확인할 것**

| 항목 | 왜 | 어디서 |
|---|---|---|
| **탄력적 IP(Elastic IP) 연결** | 안 붙어 있으면 인스턴스를 껐다 켤 때 IP가 바뀌어 `buildup.o-r.kr`이 끊김 | EC2 → 탄력적 IP → 할당 → 인스턴스에 연결(바뀌면 내도메인.한국 A 레코드도 새 IP로) |
| **자동 복구 알람** | AWS 하드웨어 문제로 멈추면 자동으로 다른 곳에서 다시 켬 | EC2 → 인스턴스 → 작업 → 모니터링 → CloudWatch 알람 → "상태 검사 실패(시스템)" 시 **복구** |
| **종료 보호** | 실수로 "종료(Terminate)" 눌러 서버가 통째로 사라지는 것 막기 | EC2 → 인스턴스 → 작업 → 인스턴스 설정 → 종료 방지 활성화 |
| **RDS 자동 백업** | DB 날아가도 되살리기 | RDS → 수정 → 백업 보존 기간 7일 |
| **요금·크레딧** | 프리 티어나 크레딧이 끝나면 서버가 멈출 수 있음 | 결제 → 예산(Budgets)에서 알림 걸어 두기 |

**⑤ https 인증서 자동 갱신 확인**

```
systemctl list-timers | grep certbot     # certbot.timer가 보이면 자동 갱신 중
sudo certbot renew --dry-run             # 갱신 연습(성공 나오면 OK)
```

**⑥ 꺼졌을 때 바로 알기**: [UptimeRobot](https://uptimerobot.com)(무료)에 `https://buildup.o-r.kr/api/health`를 5분 간격으로 등록 → 꺼지면 메일로 알림

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
- 발표 시연에 테스트 계정(`admin@buildup.kr` 등, 비밀번호 `1234`)과 예시 현장이 필요하면 `SEED_DEMO=true`를 추가하고 재시작하세요.
  DB가 비어 있을 때 한 번 들어갑니다. **비밀번호가 1234라서 발표가 끝나면 꼭 지우고 재시작**하세요(이미 들어간 데이터는 남으니 필요 없으면 계정을 사용 중지).
- API 문서(Swagger)는 운영에서 꺼져 있습니다. 발표 때만 `API_DOCS=true`를 추가하고 재시작하면 `https://도메인/swagger-ui.html`에서 보입니다.

## F. 가입 인증 메일·문자, 카카오 로그인 켜기

가입할 때 **이메일 인증과 휴대폰 인증이 필수**입니다. 아래 값이 비어 있으면 실제로 보내지 않고
서버 로그에 코드가 찍힙니다(`journalctl -u buildup -f`에서 `[개발 모드] ... 인증 코드 123456` 확인).
발표 시연은 이 상태로도 됩니다.

| 기능 | 준비할 것 | `buildup.env`에 넣을 값 |
|---|---|---|
| 인증 메일 | 팀 Gmail 계정 → 2단계 인증 켜기 → [앱 비밀번호](https://myaccount.google.com/apppasswords) 만들기 | `MAIL_USERNAME`(Gmail 주소), `MAIL_PASSWORD`(앱 비밀번호 16자리) |
| 인증 문자 | [솔라피](https://solapi.com) 가입 → 발신번호 등록(본인 휴대폰 인증) → API Key 만들기. 문자 1건 약 20원 | `SMS_API_KEY`, `SMS_API_SECRET`, `SMS_FROM`(등록한 발신번호) |
| 카카오 로그인 | [카카오 개발자](https://developers.kakao.com) → 애플리케이션 추가 → 카카오 로그인 켜기 → 동의 항목(닉네임, 카카오계정 이메일) → Redirect URI 등록 | `KAKAO_REST_API_KEY`(REST API 키), `KAKAO_CLIENT_SECRET`(보안 → Client Secret, 켰을 때만), `KAKAO_APP_ID`(앱 ID 숫자) |

카카오 Redirect URI(둘 다 등록):
- 앱: `https://도메인/api/auth/oauth/kakao/callback` (도메인이 없으면 `http://서버IP/api/auth/oauth/kakao/callback`)
- 웹: `웹 주소/oauth/kakao/callback`

> 키 값은 깃허브에 올리지 말고 `buildup.env`(권한 600)에만 넣으세요.

## G. 비용 주의
- 프리 티어(가입 12개월)라도 **RDS·EC2를 켜 둔 시간**, 탄력적 IP(연결 안 된 상태)에 요금이 붙을 수 있습니다.
- 발표·시연이 끝나면 인스턴스를 **중지**하거나 삭제하세요. AWS 콘솔 → 결제 → **예산 알림**을 꼭 켜 두세요.
