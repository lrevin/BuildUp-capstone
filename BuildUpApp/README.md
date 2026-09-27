# Build Up — 현장 관리자용 안드로이드 앱

경동대 컴퓨터공학과 캡스톤 · 건설 현장 공정 진척도 보고 앱 (React Native CLI 0.87)

## 주요 기능

- **대상**: 대형 건설사, 중소 건설사, 일용직 인력사무소까지 규모가 다양한 현장
- **계정**: 이메일 로그인, 역할 선택 가입(현장 관리자 / 일반 작업자 / 본사 관계자), 로그인 유지
  - 현장 안의 권한은 **현장마다** 정해진다: 내가 만든 현장 = 관리자, 코드로 참여한 현장 = 작업자.
    그래서 현장 관리자도 다른 현장에서는 작업자로 참여할 수 있다
  - 현장 관리자 가입 시 보고 체계 선택: **본사에 보고**(본사 코드 입력, 만드는 현장이 본사에 자동 연결)
    또는 **최고 책임자**(본사 없음, 자재 요청도 본인이 최종 승인)
  - 첫 화면: 최고 책임자는 운영 현장을 상자로(새 보고·승인 대기 자재 알림), 본사 보고 관리자는 목록에 '본사 보고' 표시.
    '내가 운영하는 현장'과 '작업자로 참여한 현장'을 나눠 보여 준다
  - 내 정보 → 작업자를 **현장 관리자로 전환**, 관리자의 **보고 체계 변경**(기존 현장의 본사 연결도 함께 변경 가능)
- **현장(워크스페이스)**: 총관리자가 현장 생성 → 6자리 참여 코드 발급·공유·재발급,
  작업자는 코드 입력 → 미리보기 → 참여. **참여한 현장만 보임**
- **공정 관리**: 고정 공정 없이 총관리자가 현장마다 공정을 직접 만든다(이름·비중·계획 날짜·순서·삭제).
  보고가 있는 공정은 기록을 지키기 위해 삭제 불가(이름 변경은 가능). 전체 진행률 = 공정 비중으로 나눈 가중 평균
- **보고 작성**: 현장 공정 선택, 0.5%p 단위 진행률, 사진 최대 10장(촬영·갤러리),
  첨부 파일 최대 5개(엑셀·PDF·한글·워드·파워포인트, 한 개당 20MB, 원래 이름으로 내려받기),
  작업 정보(날씨·투입 인원·장비), 작업 메모, 제출 전 확인 시트, 작성 중 자동 임시저장
- **현황**: 전체 진행률(공정 비중 반영), 공정별 현황, 오늘 보고 N/4
- **계획 대비 실적**: 관리자가 공정별 시작일·완료일 설정 → 오늘 계획 진행률 자동 계산,
  ±3%p 기준 지연/정상/앞섬 표시(보고 화면·현장 목록)
- **진척 현황**: 실적선·계획선 그래프(전체/공정별, 1개월·3개월·전체), 공정별 비교표,
  최근 2주 속도 기준 완료 예상일
- **이력**: 날짜별·공정별 보고 이력, 보고 상세, 사진 크게 보기, 메모 수정(작성자), 최근 보고 삭제(진행률 되돌림)
- **자재 요청**: 보고 화면에서 바로 요청(자재명·수량·단위 여러 줄, 자주 쓰는 자재, 필요일, 긴급, 메모) →
  현장 총관리자나 본사 관계자가 승인·반려(사유 선택), 처리 이력 표시, 처리 전 요청 취소
- **본사 관계자**: 가입 때 새 본사 등록(6자리 본사 코드 발급) 또는 본사 코드로 합류 →
  현장 총관리자가 현장 설정 → 본사 연결에 코드를 입력하면 그 현장이 본사 화면에 나타남.
  본사 홈: '전체 현장' 버튼 + 현장 상자(한 줄에 두 개). 상자에 빨간 '보고 N'(확인 안 한 보고), 주황 '자재 N'(승인 대기 자재).
  상자를 누르면 그 현장 보고 목록, 위쪽에서 자재 요청 승인·반려와 진척 현황으로 이동.
  본사에 연결된 현장에서 총관리자가 직접 요청한 자재는 본사가 승인·반려
- **관리**: 참여자 목록·내보내기·전화, 현장 나가기, 현장 정보 수정·삭제, 내 정보

## 실행 방법

1. Android Studio **Device Manager**에서 에뮬레이터(Pixel_6) 실행
2. 이 폴더에서:

```bash
npm install
npx react-native run-android
```

- JDK 17 사용(`android/gradle.properties`의 `org.gradle.java.home`에 고정)
- 프로젝트는 **짧은 영어 경로**에 두세요. 경로가 길거나 한글·OneDrive 경로면 C++ 빌드가 실패합니다.

### 설치 파일(APK) 만들기

```bash
cd android && gradlew.bat assembleRelease
```

결과: `android/app/build/outputs/apk/release/app-release.apk` (Metro 없이 폰에서 단독 실행, 데이터는 서버 또는 데모 모드)
현재는 디버그 키로 서명되어 있어 **테스트 배포용**입니다. 스토어 배포 시 전용 키 발급 필요.

## 테스트 계정 (비밀번호 모두 `1234`)

| 역할 | 이메일 | 상태 |
|---|---|---|
| 본사 관계자 | hq@buildup.kr | 한빛건설 본사(본사 코드 `250901`), 한빛·세종 현장 연결됨 |
| 현장 관리자(본사 보고) | admin@buildup.kr | 한빛(코드 482915)·세종(코드 731046) 운영, 한빛건설 본사에 보고 |
| 현장 관리자(최고 책임자) | park@buildup.kr | 박철근 인력사무소, 원주 단독주택(코드 615203) 운영 + 한빛에는 작업자로 참여 |
| 작업자 | worker@buildup.kr | 한빛·원주 단독주택 참여 → 세종 코드 `731046`으로 참여 테스트 |
| 작업자 | choi@buildup.kr | 한빛 참여 중 |

서버(MySQL)와 데모 모드 모두 같은 테스트 계정이 들어 있습니다.
데모 모드에서는 데이터가 폰에 저장되며, **내 정보 → 데모 데이터 초기화**로 처음 상태로 되돌릴 수 있습니다.

## 폴더 구조

```
src/
  api/client.ts      서버 주소·데모 모드 설정, 에러 문구
  api/buildup.ts     화면이 호출하는 API 함수(더미/서버 분기)
  data/dummy.ts      서버 대신 쓰는 더미 DB(권한 규칙 포함)
  data/storage.ts    폰 저장소(로그인 유지·더미 DB·임시저장)
  types.ts           데이터 모양(= 서버 API 응답 모양)
  theme.ts           색상·모서리 값
  components/        공통 UI(ui.tsx), 코드 입력, 사진 뷰어, 메뉴, 제출 시트
  screens/           화면 14개
scripts/make-icons.ps1  앱 아이콘 생성(../Buildup_image.png 로고 사용)
```

## 서버 실행 (Spring Boot + MySQL)

서버 코드는 `../buildup-server`, DB는 `../db`에 있습니다.

1. MySQL 켜기: Windows 서비스 **BuildUpMySQL**(PC 켜면 자동 시작)
2. 서버 켜기:

```bash
cd ../buildup-server
gradlew.bat bootRun
```

   - DB 비밀번호는 `buildup-server/src/main/resources/application-local.properties`에만 있습니다(깃에 올리지 않음).
   - DB가 비어 있으면 테스트 계정·현장·보고 이력이 자동으로 들어갑니다.
   - 업로드한 사진은 `buildup-server/uploads/`에 저장되고 `/files/...` 주소로 보입니다.
3. 앱 연결: 로그인 화면 아래 **서버 … · 변경** (또는 내 정보 → 연결)
   - 에뮬레이터: `http://10.0.2.2:8080/api` (기본값)
   - 실제 폰: 같은 와이파이에서 `http://PC의IP:8080/api` (PC의 IP는 `ipconfig`의 IPv4 주소).
     Windows 방화벽에서 8080 포트 허용이 필요합니다.
   - 서버 없이 보여줄 때는 **데모 모드**를 고르면 폰 안의 예시 데이터로 동작합니다.

### https 배포(운영)

**자세한 순서는 `buildup-server/deploy/DEPLOY.md`** (Nginx·자동 실행·백업 설정 예시 포함)

실행 파일 만들기: `gradlew.bat bootJar` → `build/libs/buildup-server.jar`
서버를 운영 설정으로 켠다: `java -jar buildup-server.jar --spring.profiles.active=prod`

| 환경 변수 | 뜻 |
|---|---|
| `DB_URL` | 예) `jdbc:mysql://DB주소:3306/buildup?serverTimezone=Asia/Seoul&characterEncoding=UTF-8` |
| `DB_USERNAME` · `DB_PASSWORD` | DB 계정(파일에 적지 않음) |
| `CORS_ORIGINS` | 웹 대시보드 주소(쉼표로 여러 개) |
| `UPLOAD_DIR` | 사진·첨부 파일 폴더(백업 대상) |

- 앞단(Nginx 등)에서 https를 처리하고 8080으로 넘긴다. `X-Forwarded-*` 헤더를 넘기면 사진·파일 주소가 https로 만들어진다.
- 운영에서는 데모 데이터를 넣지 않는다(`buildup.seed-demo=false`).
- 앱: 서버 설정 화면에서 `https://도메인/api` 입력. https만 쓰게 되면 `android/app/build.gradle`의 `usesCleartextTraffic`을 `false`로.

### 보안
- 비밀번호: 같은 이메일+기기에서 5번, 한 기기에서 30번 틀리면 10분 동안 막힘(남이 내 계정을 잠그기 어렵게)
- 참여 코드·본사 코드: 10번 틀리면 10분 동안 막힘. 현장 코드와 본사 코드는 따로 세고, 맞게 입력해도 기록이 지워지지 않음.
  로그인 전(가입) 본사 코드 확인은 기기 기준으로 셈. 기록은 서버 메모리에만 있어 서버를 다시 켜면 초기화
- 로그인이 만료되면(서버 401) 앱이 자동으로 로그인 화면으로
- 로그인 유지 30일(`buildup.login-days`), 로그아웃하면 서버의 로그인 기록도 삭제
- 새 가입 비밀번호 8자 이상(데모 계정은 1234 그대로)

### API (모든 경로 앞에 `/api`, 인증은 `Authorization: Bearer <token>`)

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | /auth/login · /auth/signup | `{ user, token }` 반환 |
| GET | /auth/me | 저장된 토큰으로 사용자 확인(로그인 유지) |
| PUT | /auth/me/manager | 현장 관리자 전환·보고 체계 변경 `{ companyCode?, company?, linkSites }` (코드 없으면 최고 책임자) |
| GET · POST | /sites | 내 현장 목록 · 현장 생성(코드 발급) |
| GET · PATCH · DELETE | /sites/:id | 현장 조회(관리자에게만 code 포함) · 수정 · 삭제 |
| POST | /sites/:id/code | 코드 재발급 |
| PUT | /sites/:id/processes | 공정 관리 저장 `[{ key?, name, weight, planStart, planEnd }]` (key 없으면 새 공정) |
| GET | /sites/code/:code | 코드로 현장 미리보기 |
| POST | /sites/join | `{ code }`로 참여 |
| GET | /sites/:id/members | 참여자 목록 |
| DELETE | /sites/:id/members/:userId · /members/me | 내보내기 · 나가기 |
| GET · POST | /sites/:id/reports | 보고 목록 · 제출(multipart, 사진 `photos`, 첨부 문서 `files`, 작업정보 `workLog` JSON) |
| GET | /sites/:id/reports/page?cursor=&size=30&processKey= | 보고 이력 나눠 불러오기 `{ items, nextCursor, total, processes }` (total·processes는 첫 묶음에만, 최대 50건씩) |
| POST | /reports/unread | 홈 화면 빨간 숫자: `{ seen: { 현장ID: 마지막으로 본 시각 또는 null } }` → `{ 현장ID: 확인 안 한 보고 수 }` |
| PATCH · DELETE | /reports/:id | 메모 수정 · 삭제 |
| GET · POST | /sites/:id/materials | 자재 요청 목록 · 요청(`{ processKey, items:[{name,quantity,unit}], neededBy, urgent, note }`) |
| PATCH | /materials/:id/status | 총관리자·본사: `{ status: approved·rejected, reason? }` |
| DELETE | /materials/:id | 작성자: 처리 전 요청 취소 |
| PUT · DELETE | /sites/:id/hq | 총관리자: `{ code }`로 본사 연결 · 연결 해제 |
| GET | /companies/code/:code | 본사 코드로 본사명 확인 |
| GET | /hq · /hq/sites · /hq/reports · /hq/materials | 본사 관계자: 본사 정보 · 연결 현장 · 최근 보고 · 자재 요청 |
| GET | /hq/reports/page?cursor=&size=30 | 본사 관계자: 연결된 모든 현장 보고 나눠 불러오기 |
| GET | /sites/:id/worklog.xlsx?from=&to= | 작업일보 엑셀 바로 받기(웹 대시보드용, 날짜 YYYY-MM-DD, 비우면 최근 7일, 최대 1년) |
| POST | /sites/:id/worklog/link?from=&to= | 앱용: 10분짜리 내려받기 주소 `{ url }` 발급 → 브라우저로 열기(`/downloads/…`, 로그인 불필요) |

작업일보 엑셀은 시트 3장입니다: **작업일보**(보고 한 줄씩: 날짜·공정·진행률·날씨·인원·장비·메모·작성자) ·
**일자별 요약**(날짜별 보고 수·공정·날씨·최대 인원) · **공정 현황**(공정별 현재 진행률 + 가중치 반영 전체 진행률).
앱에서는 **보고 이력** 화면(본사는 현장 보고 화면) 오른쪽 위 엑셀 버튼 → 기간 선택.

권한 규칙은 서버와 데모 모드(`src/data/dummy.ts`)가 같습니다
(예: 보고 삭제는 해당 공정의 가장 최근 보고만, 작성자 또는 현장 관리자만 / 삭제 시 진행률 되돌림).
계획 진행률·지연 계산식은 앱 `src/utils/plan.ts`와 서버 `PlanCalc.java`가 같은 식입니다.
