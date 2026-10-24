package com.buildup.server;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import tools.jackson.databind.json.JsonMapper;

/**
 * 서버를 실제로 띄우고 HTTP로 주요 흐름을 시험한다(데모 데이터 기준).
 *   admin@buildup.kr  이영호: 한빛 오피스텔(현장 1) 총관리자, 한빛건설 본사에 보고
 *   worker@buildup.kr 김현장: 한빛 오피스텔 작업자
 *   hq@buildup.kr     정본사: 한빛건설 본사 관계자
 *   park@buildup.kr   박철근: 본인 현장의 최고 책임자, 한빛에서는 작업자
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class ApiFlowTests {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final HttpClient http = HttpClient.newHttpClient();

    @Value("${local.server.port}")
    int port;

    String admin;
    String worker;
    String hq;

    record Res(int status, Map<String, Object> body, List<Object> list, byte[] bytes, String contentType) {}

    @BeforeEach
    void login() throws Exception {
        admin = token("admin@buildup.kr");
        worker = token("worker@buildup.kr");
        hq = token("hq@buildup.kr");
    }

    // ---------- 로그인 ----------

    @Test
    void 로그인_성공과_실패() throws Exception {
        assertThat(send("POST", "/api/auth/login", null, Map.of("email", "admin@buildup.kr", "password", "1234")).status())
                .isEqualTo(200);
        assertThat(send("POST", "/api/auth/login", null, Map.of("email", "admin@buildup.kr", "password", "wrong")).status())
                .isEqualTo(401);
        assertThat(send("GET", "/api/sites", null, null).status()).isEqualTo(401);
    }

    @Test
    void JWT_위조한_토큰과_사용_중지한_계정은_거절() throws Exception {
        String t = token("worker@buildup.kr");
        assertThat(t.split("[.]")).hasSize(3); // 머리.내용.서명
        assertThat(send("GET", "/api/auth/me", t, null).status()).isEqualTo(200);
        // 서명 한 글자만 바꿔도 거절
        String forged = t.substring(0, t.length() - 2) + (t.endsWith("A") ? "BB" : "AA");
        assertThat(send("GET", "/api/auth/me", forged, null).status()).isEqualTo(401);
        // 접근 토큰은 DB에 저장하지 않는다(팀 DB 설계): 로그아웃해도 만료 시각까지 유효, 리프레시 토큰만 막힌다
        assertThat(send("POST", "/api/auth/logout", t, null).status()).isEqualTo(200);
        assertThat(send("GET", "/api/auth/me", t, null).status()).isEqualTo(200);
    }

    @Test
    @SuppressWarnings("unchecked")
    void 로그인_응답과_리프레시_토큰() throws Exception {
        Res login = send("POST", "/api/auth/login", null, Map.of("email", "hq@buildup.kr", "password", "1234"));
        Map<String, Object> body = login.body();
        assertThat(body).containsKeys("user", "accessToken", "refreshToken", "tokenType",
                "accessTokenExpiresAt", "refreshTokenExpiresAt");
        assertThat(body.get("tokenType")).isEqualTo("Bearer");
        Map<String, Object> user = (Map<String, Object>) body.get("user");
        // 본사 계정 구분: role = hq, 본사를 등록한 사람은 hqRole = manager, 검토 권한 있음
        assertThat(user.get("role")).isEqualTo("hq");
        assertThat(user.get("hqRole")).isEqualTo("manager");
        assertThat(user.get("canReviewReports")).isEqualTo(true);
        String refresh = body.get("refreshToken").toString();

        // 리프레시 토큰으로 새 접근 토큰
        Res again = send("POST", "/api/auth/refresh", null, Map.of("refreshToken", refresh));
        assertThat(again.status()).isEqualTo(200);
        String access = again.body().get("accessToken").toString();
        assertThat(send("GET", "/api/auth/me", access, null).body().get("role")).isEqualTo("hq");
        assertThat(send("POST", "/api/auth/refresh", null, Map.of("refreshToken", "wrong")).status()).isEqualTo(401);

        // 로그아웃하면 리프레시 토큰은 바로 무효(접근 토큰은 만료 시각까지 유효 — API 약속)
        assertThat(send("POST", "/api/auth/logout", access, Map.of("refreshToken", refresh)).status()).isEqualTo(200);
        assertThat(send("POST", "/api/auth/refresh", null, Map.of("refreshToken", refresh)).status()).isEqualTo(401);

        // 헤더 없이 refreshToken만 보내도 로그아웃(API 약속)
        String r2 = send("POST", "/api/auth/login", null, Map.of("email", "hq@buildup.kr", "password", "1234"))
                .body().get("refreshToken").toString();
        assertThat(send("POST", "/api/auth/logout", null, Map.of("refreshToken", r2)).status()).isEqualTo(200);
        assertThat(send("POST", "/api/auth/refresh", null, Map.of("refreshToken", r2)).status()).isEqualTo(401);

        // 작업자는 hqRole 없음
        Map<String, Object> w = send("GET", "/api/auth/me", worker, null).body();
        assertThat(w.get("role")).isEqualTo("worker");
        assertThat(w.get("hqRole")).isNull();
        assertThat(w.get("canReviewReports")).isEqualTo(false);
    }

    @Test
    void 시스템_관리자_통계와_계정_사용_중지() throws Exception {
        String sys = token("sys@buildup.kr");
        Res stats = send("GET", "/api/system/stats", sys, null);
        assertThat(stats.status()).isEqualTo(200);
        assertThat(stats.body()).containsKeys("usersByRole", "sites", "reports");
        assertThat(send("GET", "/api/system/stats", worker, null).status()).isEqualTo(403);
        // 시스템 관리자는 가입으로 만들 수 없다
        assertThat(send("POST", "/api/auth/signup", null, Map.of("name", "해커", "email", "hack@test.kr",
                "phone", "010-1111-2222", "password", "password123", "role", "system")).status()).isEqualTo(400);

        // 새 작업자를 만들어 사용 중지 → 바로 로그아웃, 로그인 불가 → 다시 사용
        Res su = send("POST", "/api/auth/signup", null, Map.of("name", "중지시험", "email", "stop-test@buildup.kr",
                "phone", "010-3333-4444", "password", "password123", "role", "worker"));
        assertThat(su.status()).as(String.valueOf(su.body())).isEqualTo(200);
        String t = su.body().get("accessToken").toString();
        @SuppressWarnings("unchecked")
        String id = ((Map<String, Object>) su.body().get("user")).get("id").toString();
        assertThat(send("PATCH", "/api/system/users/" + id, sys, Map.of("disabled", true)).status()).isEqualTo(200);
        assertThat(send("GET", "/api/auth/me", t, null).status()).isEqualTo(401);
        assertThat(send("POST", "/api/auth/login", null,
                Map.of("email", "stop-test@buildup.kr", "password", "password123")).status()).isEqualTo(403);
        assertThat(send("PATCH", "/api/system/users/" + id, sys, Map.of("disabled", false)).status()).isEqualTo(200);
        assertThat(send("POST", "/api/auth/login", null,
                Map.of("email", "stop-test@buildup.kr", "password", "password123")).status()).isEqualTo(200);
    }

    // ---------- 권한 ----------

    @Test
    void 참여하지_않은_현장은_볼_수_없다() throws Exception {
        String siteId = firstSiteId(admin);
        // 본사 관계자는 연결된 현장만, 작업자는 참여한 현장만
        String parkSite = ownedSiteId(token("park@buildup.kr"));
        assertThat(send("GET", "/api/sites/" + parkSite, admin, null).status()).isEqualTo(403);
        assertThat(send("GET", "/api/sites/" + siteId, hq, null).status()).isEqualTo(200);
        assertThat(send("GET", "/api/hq/sites", worker, null).status()).isEqualTo(403);
    }

    // ---------- 보고 제출 → 검토(보완 요청 → 보완 → 승인) ----------

    @Test
    void 보고_검토_흐름() throws Exception {
        String siteId = firstSiteId(worker);
        String reportId = submitReport(worker, siteId);

        Res r = send("GET", "/api/sites/" + siteId + "/reports/page?size=5", worker, null);
        Map<String, Object> mine = findById(items(r), reportId);
        assertThat(review(mine).get("status")).isEqualTo("pending");
        assertThat(mine.get("canReview")).isEqualTo(false); // 본인 보고는 검토 못 함

        // 작업자는 검토 불가, 보완 요청은 코멘트 필수
        assertThat(send("PATCH", "/api/reports/" + reportId + "/review", worker, Map.of("status", "approved")).status())
                .isEqualTo(403);
        assertThat(send("PATCH", "/api/reports/" + reportId + "/review", hq, Map.of("status", "revision")).status())
                .isEqualTo(400);

        // 본사: 보완 요청
        Res rev = send("PATCH", "/api/reports/" + reportId + "/review", hq,
                Map.of("status", "revision", "comment", "사진을 다시 찍어 주세요"));
        assertThat(rev.status()).isEqualTo(200);
        assertThat(review(rev.body()).get("status")).isEqualTo("revision");

        // 작성자가 메모를 고치면 다시 대기
        Res fixed = send("PATCH", "/api/reports/" + reportId, worker, Map.of("memo", "다시 찍어 올렸습니다"));
        assertThat(review(fixed.body()).get("status")).isEqualTo("pending");

        // 현장 총관리자 승인, 두 번은 안 됨
        Res ok = send("PATCH", "/api/reports/" + reportId + "/review", admin, Map.of("status", "approved"));
        assertThat(ok.status()).isEqualTo(200);
        assertThat(review(ok.body()).get("status")).isEqualTo("approved");
        assertThat(send("PATCH", "/api/reports/" + reportId + "/review", hq, Map.of("status", "approved")).status())
                .isEqualTo(409);

        // 가장 최근 보고라 작성자가 지울 수 있다
        assertThat(send("DELETE", "/api/reports/" + reportId, worker, null).status()).isEqualTo(200);
    }

    @Test
    void 현장_위치에서_먼_곳에서_제출하면_확인_표시() throws Exception {
        String siteId = firstSiteId(admin);
        assertThat(send("PUT", "/api/sites/" + siteId + "/location", admin,
                Map.of("latitude", 37.3363, "longitude", 127.9310)).status()).isEqualTo(200);
        assertThat(send("PUT", "/api/sites/" + siteId + "/location", worker,
                Map.of("latitude", 1, "longitude", 1)).status()).isEqualTo(403);

        String reportId = submitReport(worker, siteId, "37.5665", "126.9780");
        Map<String, Object> rep = findById(items(send("GET", "/api/sites/" + siteId + "/reports/page", hq, null)), reportId);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> checks = (List<Map<String, Object>>) rep.get("checks");
        assertThat(checks).extracting(c -> c.get("type")).contains("far_submit");

        send("DELETE", "/api/reports/" + reportId, worker, null);
        send("PUT", "/api/sites/" + siteId + "/location", admin, java.util.Collections.singletonMap("latitude", null));
    }

    @Test
    void 공사_종류로_현장을_만들고_진행률을_직접_입력() throws Exception {
        Res noType = send("POST", "/api/sites", admin, Map.of("name", "시험 현장", "address", "원주"));
        assertThat(noType.status()).isEqualTo(400);
        Res made = send("POST", "/api/sites", admin, Map.of("name", "시험 욕실 공사", "address", "원주시", "workType", "욕실 리모델링"));
        assertThat(made.status()).isEqualTo(200);
        assertThat(made.body().get("workType")).isEqualTo("욕실 리모델링");
        assertThat(((Number) made.body().get("overallProgress")).doubleValue()).isEqualTo(0.0);
        String id = made.body().get("id").toString();

        // 진행한 작업은 꼭 써야 하고, 진행률은 지금 값보다 낮출 수 없다
        assertThat(sendForm(admin, id, Map.of("work", "", "to", "10")).status()).isEqualTo(400);
        Res ok = sendForm(admin, id, Map.of("work", "타일 철거", "to", "15"));
        assertThat(ok.status()).isEqualTo(200);
        assertThat(ok.body().get("work")).isEqualTo("타일 철거");
        assertThat(sendForm(admin, id, Map.of("work", "방수", "to", "10")).status()).isEqualTo(400);
        assertThat(((Number) send("GET", "/api/sites/" + id, admin, null).body().get("overallProgress")).doubleValue())
                .isEqualTo(15.0);
        // 가장 최근 보고를 지우면 진행률이 되돌아간다
        send("DELETE", "/api/reports/" + ok.body().get("id"), admin, null);
        assertThat(((Number) send("GET", "/api/sites/" + id, admin, null).body().get("overallProgress")).doubleValue())
                .isEqualTo(0.0);
        send("DELETE", "/api/sites/" + id, admin, null);
    }

    @Test
    void 자동_계산_현장의_보고는_공정_진행률로_저장하고_전체_진행률을_계산해_보여준다() throws Exception {
        Map<String, Object> site = send("GET", "/api/sites/" + firstSiteId(admin), admin, null).body();
        assertThat(site.get("workType")).isEqualTo("건축 신축 공사");
        double overall = ((Number) site.get("overallProgress")).doubleValue();
        Map<String, Object> latest = items(send("GET", "/api/sites/" + site.get("id") + "/reports/page?size=1", admin, null)).get(0);
        // 공정 보고를 처음부터 따라가 계산한 '가장 최근 보고 뒤 전체 진행률' = 현장 진행률
        assertThat(((Number) latest.get("to")).doubleValue()).isEqualTo(overall);
        assertThat(latest.get("work").toString()).isNotBlank();
    }

    // ---------- 나눠 불러오기 ----------

    @Test
    void 보고_이력을_나눠서_끝까지_불러온다() throws Exception {
        String siteId = firstSiteId(admin);
        Res first = send("GET", "/api/sites/" + siteId + "/reports/page?size=7", admin, null);
        long total = ((Number) first.body().get("total")).longValue();
        Set<Object> ids = new HashSet<>();
        items(first).forEach(i -> ids.add(i.get("id")));
        Object cursor = first.body().get("nextCursor");
        while (cursor != null) {
            Res next = send("GET", "/api/sites/" + siteId + "/reports/page?size=7&cursor="
                    + java.net.URLEncoder.encode(cursor.toString(), StandardCharsets.UTF_8), admin, null);
            items(next).forEach(i -> ids.add(i.get("id")));
            cursor = next.body().get("nextCursor");
        }
        assertThat(ids).hasSize((int) total);
    }

    // ---------- 자재 요청 ----------

    @Test
    void 자재_요청_승인() throws Exception {
        String siteId = firstSiteId(worker);
        Res created = send("POST", "/api/sites/" + siteId + "/materials", worker, Map.of(
                "items", List.of(Map.of("name", "철근 D13", "quantity", 2, "unit", "톤")),
                "urgent", true, "note", "시험"));
        assertThat(created.status()).isEqualTo(200);
        String id = created.body().get("id").toString();
        assertThat(send("PATCH", "/api/materials/" + id + "/status", worker, Map.of("status", "approved")).status())
                .isEqualTo(403);
        Res ok = send("PATCH", "/api/materials/" + id + "/status", hq, Map.of("status", "approved"));
        assertThat(ok.status()).isEqualTo(200);
        assertThat(ok.body().get("status")).isEqualTo("approved");
    }

    // ---------- 엑셀 ----------

    @Test
    void 작업일보_엑셀() throws Exception {
        String siteId = firstSiteId(admin);
        Res x = send("GET", "/api/sites/" + siteId + "/worklog.xlsx?from=2026-01-01&to=2026-12-31", admin, null);
        assertThat(x.status()).isEqualTo(200);
        assertThat(x.contentType()).contains("spreadsheetml");
        assertThat(new String(x.bytes(), 0, 2, StandardCharsets.ISO_8859_1)).isEqualTo("PK"); // xlsx = zip
        assertThat(send("GET", "/api/sites/" + siteId + "/worklog.xlsx?from=2026-12-01&to=2026-01-01", admin, null)
                .status()).isEqualTo(400);
    }

    @Test
    void 데모_인테리어_현장은_코드_000000_고정() throws Exception {
        String choi = token("choi@buildup.kr");
        Res preview = send("GET", "/api/sites/code/000000", choi, null);
        assertThat(preview.status()).isEqualTo(200);
        assertThat(preview.body().get("name").toString()).contains("데모 인테리어");

        Map<String, Object> demo = send("GET", "/api/sites", admin, null).list().stream()
                .map(o -> (Map<String, Object>) o)
                .filter(m -> "아파트 리모델링".equals(m.get("workType")) && Boolean.TRUE.equals(m.get("isOwner")))
                .findFirst().orElseThrow();
        Res again = send("POST", "/api/sites/" + demo.get("id") + "/code", admin, null);
        assertThat(again.status()).isEqualTo(400);
        assertThat(send("GET", "/api/sites/" + demo.get("id"), admin, null).body().get("code")).isEqualTo("000000");
    }

    @Test
    @SuppressWarnings("unchecked")
    void 진행률_자동계산과_직접입력을_골라_쓴다() throws Exception {
        // 자동 계산 현장 만들기: 철거 20 + 목공 50 + 마감 30
        Res made = send("POST", "/api/sites", admin, Map.of(
                "name", "자동 계산 시험 현장", "address", "원주", "workType", "아파트 리모델링",
                "progressMode", "auto",
                "processes", List.of(
                        Map.of("name", "철거", "weight", 20),
                        Map.of("name", "목공", "weight", 50),
                        Map.of("name", "마감", "weight", 30))));
        assertThat(made.status()).as(String.valueOf(made.body())).isEqualTo(200);
        String id = made.body().get("id").toString();
        List<Map<String, Object>> procs = (List<Map<String, Object>>) made.body().get("processes");
        assertThat(made.body().get("progressMode")).isEqualTo("auto");
        assertThat(procs).hasSize(3);

        // 가중치 합이 100이 아니면 거절
        assertThat(send("PUT", "/api/sites/" + id + "/progress-mode", admin, Map.of(
                "mode", "auto", "processes", List.of(Map.of("name", "철거", "weight", 30)))).status()).isEqualTo(400);

        // 철거 100% 보고 → 전체 20%, 목공 50% 보고 → 전체 45%
        String demolish = procs.get(0).get("key").toString();
        String wood = procs.get(1).get("key").toString();
        assertThat(sendForm(admin, id, Map.of("processKey", demolish, "processTo", "100")).status()).isEqualTo(200);
        Res second = sendForm(admin, id, Map.of("processKey", wood, "processTo", "50", "work", "거실 몰딩"));
        assertThat(second.status()).isEqualTo(200);
        assertThat(second.body().get("from")).isEqualTo(20.0);
        assertThat(second.body().get("to")).isEqualTo(45.0);
        assertThat(second.body().get("processTo")).isEqualTo(50.0);
        assertThat(send("GET", "/api/sites/" + id, admin, null).body().get("overallProgress")).isEqualTo(45.0);
        // 공정 진행률은 낮출 수 없다
        assertThat(sendForm(admin, id, Map.of("processKey", wood, "processTo", "40")).status()).isEqualTo(400);

        // 가장 최근 보고를 지우면 목공도 0%로, 전체도 20%로 돌아간다
        assertThat(send("DELETE", "/api/reports/" + second.body().get("id"), admin, null).status()).isEqualTo(200);
        assertThat(send("GET", "/api/sites/" + id, admin, null).body().get("overallProgress")).isEqualTo(20.0);

        // 직접 입력으로 바꾸면 20%에서 이어서 직접 적는다
        Res manual = send("PUT", "/api/sites/" + id + "/progress-mode", admin, Map.of("mode", "manual"));
        assertThat(manual.body().get("progressMode")).isEqualTo("manual");
        assertThat(manual.body().get("overallProgress")).isEqualTo(20.0);
        assertThat(sendForm(admin, id, Map.of("work", "도배", "to", "35")).status()).isEqualTo(200);

        // 다시 자동으로 바꾸면 모든 공정이 35%에서 시작
        Res auto = send("PUT", "/api/sites/" + id + "/progress-mode", admin, Map.of("mode", "auto",
                "processes", List.of(Map.of("key", demolish, "name", "철거", "weight", 40),
                        Map.of("name", "도장", "weight", 60))));
        assertThat(auto.status()).isEqualTo(200);
        assertThat(auto.body().get("overallProgress")).isEqualTo(35.0);
        assertThat((List<?>) auto.body().get("processes")).hasSize(2);
        assertThat(send("DELETE", "/api/sites/" + id, admin, null).status()).isEqualTo(200);
    }

    // ---------- 도움 함수 ----------

    private String token(String email) throws Exception {
        Res r = send("POST", "/api/auth/login", null, Map.of("email", email, "password", "1234"));
        assertThat(r.status()).as(email + " 로그인").isEqualTo(200);
        return r.body().get("accessToken").toString();
    }

    private String firstSiteId(String token) throws Exception {
        return ((Map<?, ?>) send("GET", "/api/sites", token, null).list().get(0)).get("id").toString();
    }

    private String ownedSiteId(String token) throws Exception {
        return send("GET", "/api/sites", token, null).list().stream()
                .map(o -> (Map<?, ?>) o)
                .filter(s -> Boolean.TRUE.equals(s.get("isOwner")))
                .findFirst().orElseThrow().get("id").toString();
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> items(Res r) {
        return (List<Map<String, Object>>) r.body().get("items");
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> review(Map<String, Object> report) {
        return (Map<String, Object>) report.get("review");
    }

    private static Map<String, Object> findById(List<Map<String, Object>> list, String id) {
        return list.stream().filter(i -> id.equals(i.get("id"))).findFirst().orElseThrow();
    }

    private String submitReport(String token, String siteId) throws Exception {
        return submitReport(token, siteId, null, null);
    }

    /** 진행한 작업 + 현장 전체 진행률(지금 값 그대로 → 진행률을 바꾸지 않음) */
    private String submitReport(String token, String siteId, String lat, String lng) throws Exception {
        Map<String, Object> site = send("GET", "/api/sites/" + siteId, token, null).body();
        String boundary = UUID.randomUUID().toString();
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        field(body, boundary, "work", "자동 테스트 작업");
        if ("auto".equals(site.get("progressMode"))) {
            Map<?, ?> first = (Map<?, ?>) ((List<?>) site.get("processes")).get(0);
            field(body, boundary, "processKey", first.get("key").toString());
            field(body, boundary, "processTo", first.get("progress").toString());
        } else {
            field(body, boundary, "to", site.get("overallProgress").toString());
        }
        field(body, boundary, "memo", "자동 테스트");
        if (lat != null) {
            field(body, boundary, "latitude", lat);
            field(body, boundary, "longitude", lng);
        }
        body.write(("--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
        HttpRequest req = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/sites/" + siteId + "/reports"))
                .header("Authorization", "Bearer " + token)
                .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                .POST(HttpRequest.BodyPublishers.ofByteArray(body.toByteArray()))
                .build();
        HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        assertThat(res.statusCode()).as(res.body()).isEqualTo(200);
        return JSON.readValue(res.body(), Map.class).get("id").toString();
    }

    /** 보고 제출(글자 항목만) */
    private Res sendForm(String token, String siteId, Map<String, String> fields) throws Exception {
        String boundary = UUID.randomUUID().toString();
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        for (var e : fields.entrySet()) {
            field(body, boundary, e.getKey(), e.getValue());
        }
        body.write(("--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));

        HttpRequest req = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/sites/" + siteId + "/reports"))
                .header("Authorization", "Bearer " + token)
                .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                .POST(HttpRequest.BodyPublishers.ofByteArray(body.toByteArray()))
                .build();
        HttpResponse<byte[]> res = http.send(req, HttpResponse.BodyHandlers.ofByteArray());
        @SuppressWarnings("unchecked")
        Map<String, Object> map = res.body().length > 0 ? JSON.readValue(res.body(), Map.class) : Map.of();
        return new Res(res.statusCode(), map, null, res.body(), "");
    }

    private static void field(ByteArrayOutputStream out, String boundary, String name, String value) throws Exception {
        out.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + name + "\"\r\n\r\n" + value + "\r\n")
                .getBytes(StandardCharsets.UTF_8));
    }

    @SuppressWarnings("unchecked")
    private Res send(String method, String path, String token, Object json) throws Exception {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
        if (token != null) {
            b.header("Authorization", "Bearer " + token);
        }
        if (json != null) {
            b.header("Content-Type", "application/json");
            b.method(method, HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(json), StandardCharsets.UTF_8));
        } else {
            b.method(method, HttpRequest.BodyPublishers.noBody());
        }
        HttpResponse<byte[]> res = http.send(b.build(), HttpResponse.BodyHandlers.ofByteArray());
        String type = res.headers().firstValue("Content-Type").orElse("");
        Map<String, Object> map = null;
        List<Object> list = null;
        if (type.contains("json") && res.body().length > 0) {
            Object parsed = JSON.readValue(res.body(), Object.class);
            if (parsed instanceof Map<?, ?> m) {
                map = (Map<String, Object>) m;
            } else if (parsed instanceof List<?> l) {
                list = (List<Object>) l;
            }
        }
        return new Res(res.statusCode(), map, list, res.body(), type);
    }
}
