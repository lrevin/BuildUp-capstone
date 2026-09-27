# Build Up — 건설 현장 진척 보고 앱

경동대학교 캡스톤 디자인 프로젝트(3인). 현장 작업자·현장 관리자·본사가 **공정 진행률, 작업일보, 사진·첨부 문서, 자재 요청**을 한 앱에서 주고받는다.

| 폴더 | 내용 |
|---|---|
| [`BuildUpApp/`](BuildUpApp) | 안드로이드 앱 — React Native 0.87 · TypeScript |
| [`buildup-server/`](buildup-server) | 백엔드 API — Spring Boot 4 · Java 17 · MySQL 8 |
| [`buildup-web/`](buildup-web) | 본사·현장 관리자 웹 대시보드 — React · TypeScript · Recharts |
| [`buildup-server/deploy/`](buildup-server/deploy) | 배포 안내(Nginx·자동 실행·백업, AWS EC2·RDS·S3) |

## 주요 기능
- **역할 4가지**: 작업자 / 현장 관리자(본사 보고 · 최고 책임자) / 본사 관계자 / 시스템 관리자(웹 전용)
- **현장**: 6자리 참여 코드로 참여, 사용자가 직접 정하는 공정과 가중치, 계획 대비 지연 표시
- **보고**: 공정 진행률 + 사진(10장) + 첨부 문서(엑셀·PDF·한글 등 5개) + 날씨·인원·장비
- **보고 검토**: 본사(또는 현장 관리자)가 승인 / 보완 요청(코멘트) → 작성자가 보완하면 다시 검토
- **허위·지연 보고 확인**: 사진 촬영 시각(EXIF)·제출 위치(GPS)로 오래된 사진, 현장 밖 제출을 표시
- **자재 요청**: 요청 → 현장 관리자 또는 본사가 승인·반려
- **본사 화면**: 연결된 현장 한눈에, 확인 안 한 보고·승인 대기 자재 표시
- **작업일보 엑셀 내보내기**, 보고 이력 나눠 불러오기, 휴대폰 알림(Firebase)
- **보안**: Spring Security + JWT(로그아웃 즉시 무효), BCrypt 비밀번호, 역할별 권한
- **사진 저장**: 서버 폴더 또는 AWS S3(비공개 버킷 + 임시 주소)

## 개발 도구
- **API 문서(Swagger)**: 서버 실행 후 http://localhost:8080/swagger-ui.html
- **자동 테스트(JUnit)**: `cd buildup-server` → `gradlew test` (메모리 DB 사용, 내 DB는 건드리지 않음)
- **GitHub Actions**: 올릴 때마다 서버 테스트·앱 검사 자동 실행(Actions 탭)
- **브랜치(Git Flow)**: `main` 발표·배포용, `develop` 개발 통합, 기능은 `feature/기능이름`에서 만들어 develop으로 합친다

## 실행 방법
자세한 내용은 각 폴더의 안내를 본다.
- 앱: [`BuildUpApp/README.md`](BuildUpApp/README.md) — 실행 방법, 테스트 계정, **API 목록**
- 웹 대시보드: [`buildup-web/README.md`](buildup-web/README.md)
- 서버 배포: [`buildup-server/deploy/DEPLOY.md`](buildup-server/deploy/DEPLOY.md)

## 저장소에 없는 파일(각자 준비)
보안 때문에 올리지 않는다. 팀장에게 따로 받는다.

| 파일 | 위치 | 용도 |
|---|---|---|
| `application-local.properties` | `buildup-server/src/main/resources/` | 내 컴퓨터 DB 비밀번호 |
| `firebase-key.json` | `buildup-server/` | 서버 → 휴대폰 알림 보내기 |
| `google-services.json` | `BuildUpApp/android/app/` | 앱 알림 받기(없으면 앱 빌드 안 됨) |
