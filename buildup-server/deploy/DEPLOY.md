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
