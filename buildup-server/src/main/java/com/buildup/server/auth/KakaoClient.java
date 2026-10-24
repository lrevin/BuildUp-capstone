package com.buildup.server.auth;

import com.buildup.server.common.ApiException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 카카오 로그인: 카카오 서버에서 회원번호·이메일·닉네임을 받아 온다.
 * - 웹: 카카오 로그인 화면이 돌려준 인가 코드(code)를 접근 토큰으로 바꾼 뒤 사용자 정보 조회
 *       (REST API 키와 Client Secret은 서버에만 둔다)
 * - 앱: 카카오 SDK가 준 접근 토큰을 받아, 우리 카카오 앱에서 발급된 토큰인지(app_id) 확인한 뒤 조회
 * 설정: buildup.kakao.rest-api-key, client-secret, app-id (환경 변수 KAKAO_REST_API_KEY, KAKAO_CLIENT_SECRET, KAKAO_APP_ID)
 */
@Component
public class KakaoClient {

    private static final Logger log = LoggerFactory.getLogger(KakaoClient.class);

    /** 카카오에서 받은 사람 정보. email은 동의하지 않았거나 인증되지 않았으면 null */
    public record KakaoUser(String id, String email, String nickname) {}

    private final JsonMapper json;
    private final String restApiKey;
    private final String clientSecret;
    private final String appId;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    public KakaoClient(
            JsonMapper json,
            @Value("${buildup.kakao.rest-api-key:}") String restApiKey,
            @Value("${buildup.kakao.client-secret:}") String clientSecret,
            @Value("${buildup.kakao.app-id:}") String appId) {
        this.json = json;
        this.restApiKey = restApiKey.trim();
        this.clientSecret = clientSecret.trim();
        this.appId = appId.trim();
    }

    /** 카카오 로그인 화면 주소(앱이 브라우저로 여는 경우 서버가 이 주소로 보낸다) */
    public String authorizeUrl(String redirectUri, String state) {
        if (restApiKey.isEmpty()) {
            throw notConfigured();
        }
        return "https://kauth.kakao.com/oauth/authorize?response_type=code"
                + "&client_id=" + URLEncoder.encode(restApiKey, StandardCharsets.UTF_8)
                + "&redirect_uri=" + URLEncoder.encode(redirectUri, StandardCharsets.UTF_8)
                + "&state=" + URLEncoder.encode(state, StandardCharsets.UTF_8);
    }

    /** 웹: 인가 코드 → 사용자 정보 */
    public KakaoUser fromCode(String code, String redirectUri) {
        if (restApiKey.isEmpty()) {
            throw notConfigured();
        }
        if (code == null || code.isBlank() || redirectUri == null || redirectUri.isBlank()) {
            throw ApiException.badRequest("카카오 로그인 정보가 없어요. 다시 시도해 주세요.");
        }
        Map<String, String> form = new LinkedHashMap<>();
        form.put("grant_type", "authorization_code");
        form.put("client_id", restApiKey);
        form.put("redirect_uri", redirectUri);
        form.put("code", code);
        if (!clientSecret.isEmpty()) {
            form.put("client_secret", clientSecret);
        }
        String body = form.entrySet().stream()
                .map(e -> e.getKey() + "=" + URLEncoder.encode(e.getValue(), StandardCharsets.UTF_8))
                .collect(Collectors.joining("&"));
        JsonNode token = call(HttpRequest.newBuilder(URI.create("https://kauth.kakao.com/oauth/token"))
                .header("Content-Type", "application/x-www-form-urlencoded;charset=utf-8")
                .POST(HttpRequest.BodyPublishers.ofString(body)));
        String accessToken = token.path("access_token").asString("");
        if (accessToken.isEmpty()) {
            throw failed();
        }
        return me(accessToken);
    }

    /** 앱: 카카오 SDK 접근 토큰 → 사용자 정보(우리 앱 토큰인지 먼저 확인) */
    public KakaoUser fromAccessToken(String accessToken) {
        if (appId.isEmpty()) {
            throw notConfigured();
        }
        if (accessToken == null || accessToken.isBlank()) {
            throw ApiException.badRequest("카카오 로그인 정보가 없어요. 다시 시도해 주세요.");
        }
        JsonNode info = call(bearer("https://kapi.kakao.com/v1/user/access_token_info", accessToken));
        if (!appId.equals(info.path("app_id").asString(""))) {
            throw ApiException.unauthorized("Build Up 카카오 로그인으로 받은 정보가 아니에요.");
        }
        return me(accessToken);
    }

    private KakaoUser me(String accessToken) {
        JsonNode me = call(bearer("https://kapi.kakao.com/v2/user/me", accessToken));
        String id = me.path("id").asString("");
        if (id.isEmpty()) {
            throw failed();
        }
        JsonNode account = me.path("kakao_account");
        // 카카오가 인증한 유효한 이메일만 믿는다
        boolean emailOk = account.path("is_email_valid").asBoolean(false)
                && account.path("is_email_verified").asBoolean(false);
        String email = emailOk ? account.path("email").asString(null) : null;
        String nickname = account.path("profile").path("nickname").asString(null);
        return new KakaoUser(id, email == null ? null : email.trim().toLowerCase(), nickname);
    }

    private static HttpRequest.Builder bearer(String url, String token) {
        return HttpRequest.newBuilder(URI.create(url)).header("Authorization", "Bearer " + token).GET();
    }

    private JsonNode call(HttpRequest.Builder req) {
        try {
            HttpResponse<String> res = http.send(req.timeout(Duration.ofSeconds(10)).build(),
                    HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() == 401) {
                throw ApiException.unauthorized("카카오 로그인이 만료됐어요. 다시 시도해 주세요.");
            }
            if (res.statusCode() / 100 != 2) {
                log.warn("카카오 응답 오류: {} {}", res.statusCode(), res.body());
                throw failed();
            }
            return json.readTree(res.body());
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            log.warn("카카오 연결 실패: {}", e.getMessage());
            throw failed();
        }
    }

    private static ApiException notConfigured() {
        return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "카카오 로그인이 아직 설정되지 않았어요.");
    }

    private static ApiException failed() {
        return new ApiException(HttpStatus.BAD_GATEWAY, "카카오 로그인에 실패했어요. 잠시 뒤에 다시 시도해 주세요.");
    }
}
