package com.buildup.server.auth;

import com.buildup.server.auth.AuthDtos.AuthResponse;
import com.buildup.server.auth.AuthDtos.LoginRequest;
import com.buildup.server.auth.AuthDtos.SignUpRequest;
import com.buildup.server.user.UserDto;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService auth;

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest req) {
        return auth.login(req);
    }

    @PostMapping("/signup")
    public AuthResponse signUp(@Valid @RequestBody SignUpRequest req) {
        return auth.signUp(req);
    }

    /** 저장된 토큰으로 로그인 유지 확인 */
    @GetMapping("/me")
    public UserDto me() {
        return auth.me(CurrentUser.id());
    }

    /** 현장 관리자로 전환하거나 보고 체계(본사 보고 / 최고 책임자)를 바꾼다 */
    @org.springframework.web.bind.annotation.PutMapping("/me/manager")
    public UserDto setManager(@RequestBody com.buildup.server.auth.AuthDtos.ManagerRequest req) {
        return auth.setManager(CurrentUser.id(), req.companyCode(), req.company(),
                Boolean.TRUE.equals(req.linkSites()));
    }

    @PostMapping("/logout")
    public Map<String, Boolean> logout(HttpServletRequest request) {
        auth.logout(TokenAuthFilter.bearer(request));
        return Map.of("ok", true);
    }
}
