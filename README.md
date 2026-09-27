# Build Up — 건설 현장 진척 보고 앱

경동대학교 캡스톤 디자인 프로젝트(3인). 현장 작업자·현장 관리자·본사가 **공정 진행률, 작업일보, 사진·첨부 문서, 자재 요청**을 한 앱에서 주고받는다.

| 폴더 | 내용 |
|---|---|
| [`BuildUpApp/`](BuildUpApp) | 안드로이드 앱 — React Native 0.87 · TypeScript |
| [`buildup-server/`](buildup-server) | 백엔드 API — Spring Boot 4 · Java 17 · MySQL 8 |
| [`buildup-server/deploy/`](buildup-server/deploy) | https 배포 안내(Nginx·자동 실행·백업) |

## 주요 기능
- **역할 3가지**: 작업자 / 현장 관리자(본사 보고 · 최고 책임자) / 본사 관계자
- **현장**: 6자리 참여 코드로 참여, 사용자가 직접 정하는 공정과 가중치, 계획 대비 지연 표시
- **보고**: 공정 진행률 + 사진(10장) + 첨부 문서(엑셀·PDF·한글 등 5개) + 날씨·인원·장비
- **자재 요청**: 요청 → 현장 관리자 또는 본사가 승인·반려
- **본사 화면**: 연결된 현장 한눈에, 확인 안 한 보고·승인 대기 자재 표시
- **작업일보 엑셀 내보내기**, 보고 이력 나눠 불러오기, 휴대폰 알림(Firebase)

## 실행 방법
자세한 내용은 각 폴더의 안내를 본다.
- 앱: [`BuildUpApp/README.md`](BuildUpApp/README.md) — 실행 방법, 테스트 계정, **API 목록**
- 서버 배포: [`buildup-server/deploy/DEPLOY.md`](buildup-server/deploy/DEPLOY.md)

## 저장소에 없는 파일(각자 준비)
보안 때문에 올리지 않는다. 팀장에게 따로 받는다.

| 파일 | 위치 | 용도 |
|---|---|---|
| `application-local.properties` | `buildup-server/src/main/resources/` | 내 컴퓨터 DB 비밀번호 |
| `firebase-key.json` | `buildup-server/` | 서버 → 휴대폰 알림 보내기 |
| `google-services.json` | `BuildUpApp/android/app/` | 앱 알림 받기(없으면 앱 빌드 안 됨) |
