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
import org.springframework.web.bind.annotation.GetMapping;
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

    @Operation(summary = "로그인 → { user, accessToken, refreshToken, tokenType, accessTokenExpiresAt, refreshTokenExpiresAt }")
    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest req) {
        return auth.login(req);
    }

    @Operation(summary = "회원가입(작업자·현장 관리자·본사 관계자)")
    @PostMapping("/signup")
    public AuthResponse signUp(@Valid @RequestBody SignUpRequest req) {
        return auth.signUp(req);
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
