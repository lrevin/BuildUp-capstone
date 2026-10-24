package com.buildup.server.auth;

import com.buildup.server.auth.AuthDtos.AuthResponse;
import com.buildup.server.auth.AuthDtos.LoginRequest;
import com.buildup.server.auth.AuthDtos.SignUpRequest;
import com.buildup.server.user.UserDto;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.Map;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import com.buildup.server.common.ApiException;
import com.buildup.server.common.AttemptLimiter;
import java.time.Duration;
import java.net.URI;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Tag(name = "01 로그인·회원가입", description = "가입, 로그인, 로그아웃, 내 정보, 관리자 전환")
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService auth;
    private final SignupVerification verification;
    private final KakaoClient kakao;
    private final KakaoAppLogin kakaoApp;
    private final AttemptLimiter limiter;

    @Operation(summary = "로그인 → { user, accessToken, refreshToken, tokenType, accessTokenExpiresAt, refreshTokenExpiresAt }")
    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest req) {
        return auth.login(req);
    }

    @Operation(summary = "회원가입(작업자·현장 관리자·본사 관계자): emailVerificationToken·phoneVerificationToken 필요, 카카오 가입이면 signupToken")
    @PostMapping("/signup")
    public AuthResponse signUp(@Valid @RequestBody SignUpRequest req) {
        return auth.signUp(req);
    }

    @Operation(summary = "이메일 인증 코드 보내기: { email } → { expiresInSeconds, resendAfterSeconds }")
    @PostMapping("/email/send")
    public AuthDtos.CodeSentResponse sendEmailCode(@Valid @RequestBody AuthDtos.EmailRequest req) {
        return verification.sendEmail(req.email());
    }

    @Operation(summary = "이메일 인증 코드 확인: { email, code } → { emailVerificationToken, expiresInSeconds }")
    @PostMapping("/email/verify")
    public AuthDtos.EmailVerifiedResponse verifyEmailCode(@Valid @RequestBody AuthDtos.EmailVerifyRequest req) {
        return verification.verifyEmail(req.email(), req.code());
    }

    @Operation(summary = "휴대폰 인증 문자 보내기: { phone } → { expiresInSeconds, resendAfterSeconds }")
    @PostMapping("/phone/send")
    public AuthDtos.CodeSentResponse sendPhoneCode(@Valid @RequestBody AuthDtos.PhoneRequest req) {
        return verification.sendPhone(req.phone());
    }

    @Operation(summary = "휴대폰 인증 코드 확인: { phone, code } → { phoneVerificationToken, expiresInSeconds }")
    @PostMapping("/phone/verify")
    public AuthDtos.PhoneVerifiedResponse verifyPhoneCode(@Valid @RequestBody AuthDtos.PhoneVerifyRequest req) {
        return verification.verifyPhone(req.phone(), req.code());
    }

    @Operation(summary = "카카오 로그인: 웹 { code, redirectUri } / 앱 { accessToken } → 로그인 응답 또는 { signupRequired, signupToken, email, name }")
    @PostMapping("/oauth/kakao")
    public Object kakao(@RequestBody AuthDtos.KakaoLoginRequest req) {
        return auth.kakaoLogin(req);
    }

    // ---- 앱의 카카오 로그인(브라우저 → 서버 → 앱). 흐름은 KakaoAppLogin 설명 참고 ----

    @Operation(summary = "앱: 카카오 로그인 시작 → { url(브라우저로 열 주소), key(결과를 받을 때 보낼 값, 앱만 기억) }")
    @PostMapping("/oauth/kakao/begin")
    public Map<String, String> kakaoBegin() {
        limiter.hit("kakao-begin:" + AttemptLimiter.clientIp(), 30, Duration.ofMinutes(10),
                "카카오 로그인을 너무 많이 시도했어요.");
        KakaoAppLogin.Started s = kakaoApp.begin();
        String url = ServletUriComponentsBuilder.fromCurrentContextPath()
                .path("/api/auth/oauth/kakao/start").queryParam("state", s.state()).toUriString();
        return Map.of("url", url, "key", s.key());
    }

    @Operation(summary = "앱: begin에서 받은 주소를 휴대폰 브라우저로 열면 카카오 로그인 화면으로 이동")
    @GetMapping(value = "/oauth/kakao/start", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> kakaoStart(@RequestParam(required = false) String state) {
        String key = kakaoApp.keyOf(state);
        if (key == null) {
            return message("카카오 로그인 시간이 지났어요. 앱에서 다시 시도해 주세요.");
        }
        try {
            String url = kakao.authorizeUrl(kakaoCallbackUrl(), state);
            return ResponseEntity.status(HttpStatus.FOUND).location(URI.create(url)).build();
        } catch (ApiException e) {
            // 카카오 설정이 없는 서버 등: 브라우저에 오류 글자 대신 앱으로 돌아가 안내
            kakaoApp.useState(state);
            return backToApp(new KakaoAppLogin.Result(null, e.getStatus().value(), e.getMessage()), key);
        }
    }

    @Operation(summary = "앱: 카카오가 돌려보내는 주소. 로그인 결과를 일회용 티켓으로 앱(buildupapp://)에 넘긴다")
    @GetMapping(value = "/oauth/kakao/callback", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> kakaoCallback(
            @RequestParam(required = false) String code,
            @RequestParam(required = false) String state,
            @RequestParam(required = false) String error) {
        String key = kakaoApp.useState(state);
        if (key == null) {
            return message("카카오 로그인 시간이 지났어요. 앱에서 다시 시도해 주세요.");
        }
        KakaoAppLogin.Result result;
        if (error != null || code == null) {
            result = new KakaoAppLogin.Result(null, 400, "카카오 로그인을 취소했어요.");
        } else {
            try {
                result = new KakaoAppLogin.Result(
                        auth.kakaoLogin(new AuthDtos.KakaoLoginRequest(code, kakaoCallbackUrl(), null)), 200, null);
            } catch (ApiException e) {
                result = new KakaoAppLogin.Result(null, e.getStatus().value(), e.getMessage());
            } catch (RuntimeException e) {
                result = new KakaoAppLogin.Result(null, 500, "카카오 로그인 중 문제가 생겼어요. 잠시 뒤에 다시 시도해 주세요.");
            }
        }
        return backToApp(result, key);
    }

    /** 결과를 일회용 티켓에 담아 앱(buildupapp://oauth/kakao)을 여는 작은 화면 */
    private ResponseEntity<String> backToApp(KakaoAppLogin.Result result, String key) {
        String ticket = kakaoApp.ticket(result, key);
        String intent = "intent://oauth/kakao?ticket=" + ticket
                + "#Intent;scheme=buildupapp;package=com.buildupapp;end";
        return html("Build Up 앱으로 돌아가는 중이에요",
                "<p><a href=\"" + intent + "\" style=\"display:inline-block;margin-top:16px;padding:14px 28px;"
                        + "border-radius:12px;background:#F5B21F;color:#111;font-weight:700;text-decoration:none\">"
                        + "앱으로 돌아가기</a></p><script>location.href=\"" + intent + "\";</script>");
    }

    /** 앱으로 돌아가지 않고 안내만 보여 주는 화면(문구는 서버가 정한 고정 문장만) */
    private static ResponseEntity<String> message(String text) {
        return html(text, "<p style=\"color:#666\">이 창을 닫고 Build Up 앱으로 돌아가 주세요.</p>");
    }

    private static ResponseEntity<String> html(String title, String body) {
        String page = "<!doctype html><html lang=\"ko\"><head><meta charset=\"utf-8\">"
                + "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Build Up</title></head>"
                + "<body style=\"font-family:sans-serif;text-align:center;padding:64px 24px;color:#111\">"
                + "<p style=\"font-size:18px;font-weight:700\">" + title + "</p>" + body + "</body></html>";
        return ResponseEntity.ok().contentType(new MediaType(MediaType.TEXT_HTML, java.nio.charset.StandardCharsets.UTF_8))
                .header("Cache-Control", "no-store")
                .body(page);
    }

    @Operation(summary = "앱: 티켓으로 카카오 로그인 결과 받기 { ticket, key } → 로그인 응답 또는 { signupRequired, signupToken, ... }")
    @PostMapping("/oauth/kakao/ticket")
    public Object kakaoTicket(@RequestBody Map<String, String> req) {
        return kakaoApp.redeem(req == null ? null : req.get("ticket"), req == null ? null : req.get("key"));
    }

    /** 이 서버의 카카오 돌아오는 주소(카카오 개발자 콘솔 Redirect URI에 등록) */
    private static String kakaoCallbackUrl() {
        return ServletUriComponentsBuilder.fromCurrentContextPath().path("/api/auth/oauth/kakao/callback").toUriString();
    }

    /** 저장된 토큰으로 로그인 유지 확인 */
    @Operation(summary = "저장된 토큰으로 로그인 유지 확인")
    @GetMapping("/me")
    public UserDto me() {
        return auth.me(CurrentUser.id());
    }

    /** 현장 관리자로 전환하거나 보고 체계(본사 보고 / 최고 책임자)를 바꾼다 */
    @Operation(summary = "현장 관리자로 전환 / 보고 체계(본사 보고·최고 책임자) 변경")
    @org.springframework.web.bind.annotation.PutMapping("/me/manager")
    public UserDto setManager(@RequestBody com.buildup.server.auth.AuthDtos.ManagerRequest req) {
        return auth.setManager(CurrentUser.id(), req.companyCode(), req.company(),
                Boolean.TRUE.equals(req.linkSites()));
    }

    @Operation(summary = "접근 토큰 다시 받기: { refreshToken } → 로그인과 같은 응답")
    @PostMapping("/refresh")
    public AuthResponse refresh(@RequestBody AuthDtos.RefreshRequest req) {
        return auth.refresh(req.refreshToken());
    }

    @Operation(summary = "로그아웃: Authorization 헤더의 접근 토큰 + body { refreshToken } 모두 무효")
    @PostMapping("/logout")
    public Map<String, Boolean> logout(
            HttpServletRequest request,
            @RequestBody(required = false) AuthDtos.RefreshRequest req) {
        auth.logout(TokenAuthFilter.bearer(request), req == null ? null : req.refreshToken());
        return Map.of("ok", true);
    }
}
