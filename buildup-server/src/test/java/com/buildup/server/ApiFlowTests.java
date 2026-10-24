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
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import com.buildup.server.auth.KakaoClient;
import com.buildup.server.auth.VerificationSender;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import java.util.HashMap;
import org.springframework.beans.factory.annotation.Autowired;
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

    @Autowired
    VerificationSender sender;

    /** 카카오 서버 대신(테스트에서는 카카오에 접속하지 않는다) */
    @MockitoBean
    KakaoClient kakao;

    String admin;
    String worker;
    String hq;

    record Res(int status, Map<String, Object> body, List<Object> list, byte[] bytes, String contentType,
            java.net.http.HttpHeaders headers) {}

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
        Res su = send("POST", "/api/auth/signup", null, verified(Map.of("name", "중지시험", "email", "stop-test@buildup.kr",
                "phone", "010-3333-4444", "password", "password123", "role", "worker")));
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

    // ---------- 가입 인증(이메일·휴대폰 필수), 카카오 ----------

    @Test
    void 가입은_이메일과_휴대폰_인증을_마쳐야_된다() throws Exception {
        Map<String, Object> form = Map.of("name", "인증시험", "email", "Verify-Test@buildup.kr",
                "phone", "010-5555-6666", "password", "password123", "role", "worker");
        // 인증 없이 가입 → 거절
        Res no = send("POST", "/api/auth/signup", null, form);
        assertThat(no.status()).isEqualTo(400);
        assertThat(no.body().get("message")).isEqualTo("이메일 인증을 완료해 주세요.");
        // 이미 가입된 이메일로는 코드를 보내지 않는다
        assertThat(send("POST", "/api/auth/email/send", null, Map.of("email", "admin@buildup.kr")).status()).isEqualTo(409);

        // 이메일 인증: 코드 받기 → 60초 안에 다시 받기는 막힘 → 틀린 코드 → 맞는 코드
        Res sent = send("POST", "/api/auth/email/send", null, Map.of("email", "verify-test@buildup.kr"));
        assertThat(sent.status()).isEqualTo(200);
        assertThat(sent.body()).containsEntry("expiresInSeconds", 300).containsEntry("resendAfterSeconds", 60);
        assertThat(send("POST", "/api/auth/email/send", null, Map.of("email", "verify-test@buildup.kr")).status())
                .isEqualTo(429);
        String code = sender.loggedCode("verify-test@buildup.kr");
        String wrong = code.equals("000000") ? "111111" : "000000";
        assertThat(send("POST", "/api/auth/email/verify", null,
                Map.of("email", "verify-test@buildup.kr", "code", wrong)).status()).isEqualTo(400);
        Res ev = send("POST", "/api/auth/email/verify", null, Map.of("email", "verify-test@buildup.kr", "code", code));
        assertThat(ev.status()).isEqualTo(200);
        String emailToken = ev.body().get("emailVerificationToken").toString();

        // 이메일만 인증 → 휴대폰 인증이 없어서 거절
        Map<String, Object> withEmail = new HashMap<>(form);
        withEmail.put("emailVerificationToken", emailToken);
        Res noPhone = send("POST", "/api/auth/signup", null, withEmail);
        assertThat(noPhone.body().get("message")).isEqualTo("휴대폰 인증을 완료해 주세요.");

        // 휴대폰 번호가 아니면 문자를 보내지 않는다
        assertThat(send("POST", "/api/auth/phone/send", null, Map.of("phone", "02-123-4567")).status()).isEqualTo(400);
        assertThat(send("POST", "/api/auth/phone/send", null, Map.of("phone", "010-5555-6666")).status()).isEqualTo(200);
        Res pv = send("POST", "/api/auth/phone/verify", null,
                Map.of("phone", "01055556666", "code", sender.loggedCode("01055556666")));
        assertThat(pv.status()).isEqualTo(200);
        String phoneToken = pv.body().get("phoneVerificationToken").toString();

        // 인증한 번호와 다른 번호로 가입 → 거절
        Map<String, Object> otherPhone = new HashMap<>(withEmail);
        otherPhone.put("phone", "010-9999-0000");
        otherPhone.put("phoneVerificationToken", phoneToken);
        assertThat(send("POST", "/api/auth/signup", null, otherPhone).status()).isEqualTo(400);

        Map<String, Object> ok = new HashMap<>(withEmail);
        ok.put("phoneVerificationToken", phoneToken);
        Res su = send("POST", "/api/auth/signup", null, ok);
        assertThat(su.status()).as(String.valueOf(su.body())).isEqualTo(200);
        assertThat(su.body()).containsKeys("accessToken", "refreshToken");

        // 쓴 인증은 다시 쓸 수 없다(같은 인증으로 계정을 또 만들 수 없게)
        Map<String, Object> again = new HashMap<>(ok);
        again.put("email", "verify-test2@buildup.kr");
        assertThat(send("POST", "/api/auth/signup", null, again).status()).isEqualTo(400);
    }

    @Test
    void 인증_코드를_5번_틀리면_다시_받아야_한다() throws Exception {
        assertThat(send("POST", "/api/auth/phone/send", null, Map.of("phone", "010-7777-1234")).status()).isEqualTo(200);
        String code = sender.loggedCode("01077771234");
        String wrong = code.equals("000000") ? "111111" : "000000";
        for (int i = 0; i < 4; i++) {
            assertThat(send("POST", "/api/auth/phone/verify", null,
                    Map.of("phone", "010-7777-1234", "code", wrong)).status()).isEqualTo(400);
        }
        assertThat(send("POST", "/api/auth/phone/verify", null,
                Map.of("phone", "010-7777-1234", "code", wrong)).status()).isEqualTo(429);
        // 맞는 코드여도 이미 버려진 코드라 안 된다
        assertThat(send("POST", "/api/auth/phone/verify", null,
                Map.of("phone", "010-7777-1234", "code", code)).status()).isEqualTo(400);
    }

    @Test
    void 카카오_설정이_없으면_안내한다() {
        KakaoClient off = new KakaoClient(JSON, "", "", "");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> off.fromAccessToken("x"))
                .hasMessage("카카오 로그인이 아직 설정되지 않았어요.");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> off.fromCode("c", "http://localhost/cb"))
                .hasMessage("카카오 로그인이 아직 설정되지 않았어요.");
    }

    @Test
    void 카카오_첫_로그인은_가입하고_다음부터는_바로_로그인() throws Exception {
        when(kakao.fromAccessToken("kakao-token-1"))
                .thenReturn(new KakaoClient.KakaoUser("9001", "kakao-user@kakao.com", "카카오사람"));
        Res first = send("POST", "/api/auth/oauth/kakao", null, Map.of("accessToken", "kakao-token-1"));
        assertThat(first.status()).isEqualTo(200);
        assertThat(first.body()).containsEntry("signupRequired", true)
                .containsEntry("email", "kakao-user@kakao.com").containsEntry("name", "카카오사람");
        String signupToken = first.body().get("signupToken").toString();

        // 카카오가 인증한 이메일 그대로 가입: 이메일 인증·비밀번호 없이, 휴대폰 인증만
        Map<String, Object> form = new HashMap<>(Map.of("name", "카카오사람", "email", "kakao-user@kakao.com",
                "phone", "010-8080-9090", "role", "worker", "signupToken", signupToken));
        form.put("phoneVerificationToken", phoneToken("010-8080-9090"));
        Res su = send("POST", "/api/auth/signup", null, form);
        assertThat(su.status()).as(String.valueOf(su.body())).isEqualTo(200);

        // 다음부터는 카카오로 바로 로그인, 비밀번호 로그인은 안 됨(비밀번호가 없는 계정)
        Res again = send("POST", "/api/auth/oauth/kakao", null, Map.of("accessToken", "kakao-token-1"));
        assertThat(again.status()).isEqualTo(200);
        assertThat(again.body()).containsKeys("accessToken", "refreshToken").doesNotContainKey("signupRequired");
        assertThat(send("POST", "/api/auth/login", null,
                Map.of("email", "kakao-user@kakao.com", "password", "anything1")).status()).isEqualTo(401);
    }

    @Test
    void 카카오_이메일로_이미_가입한_계정은_자동으로_연결하지_않는다() throws Exception {
        when(kakao.fromAccessToken("kakao-token-admin"))
                .thenReturn(new KakaoClient.KakaoUser("9002", "admin@buildup.kr", "이영호"));
        Res r = send("POST", "/api/auth/oauth/kakao", null, Map.of("accessToken", "kakao-token-admin"));
        assertThat(r.status()).isEqualTo(409);
        assertThat(r.body().get("message")).isEqualTo("이미 이메일로 가입된 계정이에요. 이메일로 로그인해 주세요.");
    }

    @Test
    void 앱_카카오_로그인은_브라우저에서_티켓으로_돌아온다() throws Exception {
        when(kakao.authorizeUrl(anyString(), anyString()))
                .thenAnswer(a -> "https://kauth.kakao.com/oauth/authorize?state=" + a.getArgument(1));
        when(kakao.fromCode(eq("kakao-code"), anyString()))
                .thenReturn(new KakaoClient.KakaoUser("9003", null, "이메일없음"));
        Res start = send("GET", "/api/auth/oauth/kakao/start", null, null);
        assertThat(start.status()).isEqualTo(302);
        String location = start.headers().firstValue("Location").orElseThrow();
        String state = location.substring(location.indexOf("state=") + 6);

        // 다른 state로 돌아오면 거절(남이 만든 로그인 결과를 끼워 넣는 것 방지)
        String badTicket = ticketFrom(send("GET", "/api/auth/oauth/kakao/callback?code=kakao-code&state=wrong", null, null));
        assertThat(send("POST", "/api/auth/oauth/kakao/ticket", null, Map.of("ticket", badTicket)).status())
                .isEqualTo(400);

        Res cb = send("GET", "/api/auth/oauth/kakao/callback?code=kakao-code&state=" + state, null, null);
        assertThat(cb.contentType()).contains("text/html");
        String ticket = ticketFrom(cb);
        Res r = send("POST", "/api/auth/oauth/kakao/ticket", null, Map.of("ticket", ticket));
        assertThat(r.status()).isEqualTo(200);
        assertThat(r.body()).containsEntry("signupRequired", true).containsEntry("name", "이메일없음");
        assertThat(r.body().get("email")).isNull();
        // 티켓은 한 번만
        assertThat(send("POST", "/api/auth/oauth/kakao/ticket", null, Map.of("ticket", ticket)).status())
                .isEqualTo(400);
        // 같은 state는 다시 쓸 수 없다
        String reused = ticketFrom(send("GET", "/api/auth/oauth/kakao/callback?code=kakao-code&state=" + state, null, null));
        assertThat(send("POST", "/api/auth/oauth/kakao/ticket", null, Map.of("ticket", reused)).status())
                .isEqualTo(400);
    }

    @Test
    void 카카오_설정이_없는_서버에서_앱으로_시작하면_앱이_안내를_받는다() throws Exception {
        when(kakao.authorizeUrl(anyString(), anyString())).thenThrow(new com.buildup.server.common.ApiException(
                org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE, "카카오 로그인이 아직 설정되지 않았어요."));
        Res start = send("GET", "/api/auth/oauth/kakao/start", null, null);
        assertThat(start.status()).isEqualTo(200);
        Res r = send("POST", "/api/auth/oauth/kakao/ticket", null, Map.of("ticket", ticketFrom(start)));
        assertThat(r.status()).isEqualTo(503);
        assertThat(r.body().get("message")).isEqualTo("카카오 로그인이 아직 설정되지 않았어요.");
    }

    @Test
    void 가짜_카카오_가입_토큰은_거절() throws Exception {
        Map<String, Object> form = new HashMap<>(verified(Map.of("name", "카카오시험", "email", "kakao-test@buildup.kr",
                "phone", "010-2468-1357", "role", "worker")));
        form.put("signupToken", "st_fake");
        assertThat(send("POST", "/api/auth/signup", null, form).status()).isEqualTo(400);
        // 카카오 가입이 아니면 비밀번호가 있어야 한다
        form.remove("signupToken");
        Res noPw = send("POST", "/api/auth/signup", null, form);
        assertThat(noPw.body().get("message")).isEqualTo("비밀번호를 입력해 주세요.");
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
        return new Res(res.statusCode(), map, null, res.body(), "", res.headers());
    }

    private static void field(ByteArrayOutputStream out, String boundary, String name, String value) throws Exception {
        out.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + name + "\"\r\n\r\n" + value + "\r\n")
                .getBytes(StandardCharsets.UTF_8));
    }

    private String phoneToken(String phone) throws Exception {
        String digits = phone.replaceAll("\\D", "");
        assertThat(send("POST", "/api/auth/phone/send", null, Map.of("phone", digits)).status()).isEqualTo(200);
        return send("POST", "/api/auth/phone/verify", null, Map.of("phone", digits, "code", sender.loggedCode(digits)))
                .body().get("phoneVerificationToken").toString();
    }

    private static String ticketFrom(Res html) {
        Matcher m = Pattern.compile("ticket=([0-9a-f]+)").matcher(new String(html.bytes(), StandardCharsets.UTF_8));
        assertThat(m.find()).isTrue();
        return m.group(1);
    }

    /** 가입 양식에 이메일·휴대폰 인증 결과를 붙인다(개발 모드라 코드는 서버가 기억해 둔 것을 읽는다) */
    private Map<String, Object> verified(Map<String, Object> form) throws Exception {
        String email = form.get("email").toString().trim().toLowerCase();
        String phone = form.get("phone").toString().replaceAll("\\D", "");
        assertThat(send("POST", "/api/auth/email/send", null, Map.of("email", email)).status()).isEqualTo(200);
        Res ev = send("POST", "/api/auth/email/verify", null, Map.of("email", email, "code", sender.loggedCode(email)));
        assertThat(send("POST", "/api/auth/phone/send", null, Map.of("phone", phone)).status()).isEqualTo(200);
        Res pv = send("POST", "/api/auth/phone/verify", null, Map.of("phone", phone, "code", sender.loggedCode(phone)));
        Map<String, Object> out = new HashMap<>(form);
        out.put("emailVerificationToken", ev.body().get("emailVerificationToken"));
        out.put("phoneVerificationToken", pv.body().get("phoneVerificationToken"));
        return out;
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
        return new Res(res.statusCode(), map, list, res.body(), type, res.headers());
    }
}
