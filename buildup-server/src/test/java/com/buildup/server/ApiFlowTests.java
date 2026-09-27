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
    void JWT_위조와_로그아웃한_토큰은_거절() throws Exception {
        String t = token("worker@buildup.kr");
        assertThat(t.split("[.]")).hasSize(3); // 머리.내용.서명
        assertThat(send("GET", "/api/auth/me", t, null).status()).isEqualTo(200);
        // 서명 한 글자만 바꿔도 거절
        String forged = t.substring(0, t.length() - 2) + (t.endsWith("A") ? "BB" : "AA");
        assertThat(send("GET", "/api/auth/me", forged, null).status()).isEqualTo(401);
        // 로그아웃하면 같은 토큰은 바로 무효
        assertThat(send("POST", "/api/auth/logout", t, null).status()).isEqualTo(200);
        assertThat(send("GET", "/api/auth/me", t, null).status()).isEqualTo(401);
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
        String t = su.body().get("token").toString();
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

    // ---------- 도움 함수 ----------

    private String token(String email) throws Exception {
        Res r = send("POST", "/api/auth/login", null, Map.of("email", email, "password", "1234"));
        assertThat(r.status()).as(email + " 로그인").isEqualTo(200);
        return r.body().get("token").toString();
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

    /** 마감(finish) 공정을 현재 진행률 그대로 보고(진행률을 바꾸지 않음) */
    private String submitReport(String token, String siteId, String lat, String lng) throws Exception {
        Map<String, Object> site = send("GET", "/api/sites/" + siteId, token, null).body();
        @SuppressWarnings("unchecked")
        Map<String, Object> finish = ((List<Map<String, Object>>) site.get("processes")).stream()
                .filter(p -> "finish".equals(p.get("key"))).findFirst().orElseThrow();
        String boundary = UUID.randomUUID().toString();
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        field(body, boundary, "processKey", "finish");
        field(body, boundary, "to", finish.get("progress").toString());
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
