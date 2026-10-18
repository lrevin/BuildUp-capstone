package com.buildup.server.auth;

import com.buildup.server.user.UserDto;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** 로그인·가입 요청/응답 모양(앱 src/api/buildup.ts와 같음) */
public final class AuthDtos {

    private AuthDtos() {}

    public record LoginRequest(
            @NotBlank(message = "이메일을 입력해 주세요.") String email,
            @NotBlank(message = "비밀번호를 입력해 주세요.") String password) {}

    public record SignUpRequest(
            @NotBlank(message = "역할을 선택해 주세요.")
            @Pattern(regexp = "admin|worker|hq", message = "역할이 올바르지 않습니다.")
            String role,
            @NotBlank(message = "이름을 입력해 주세요.") @Size(max = 50, message = "이름이 너무 길어요.") String name,
            @NotBlank(message = "이메일을 입력해 주세요.") @Email(message = "이메일 형식이 올바르지 않아요.")
            @Size(max = 120, message = "이메일이 너무 길어요.") String email,
            @NotBlank(message = "휴대폰 번호를 입력해 주세요.") @Size(max = 20, message = "휴대폰 번호를 확인해 주세요.")
            String phone,
            @NotBlank(message = "비밀번호를 입력해 주세요.") @Size(min = 8, max = 64, message = "비밀번호는 8자 이상이어야 해요.")
            String password,
            @Size(max = 80, message = "회사·본사 이름은 80자까지 쓸 수 있어요.") String company,
            // 본사 관계자: companyCode가 있으면 그 본사에 합류, 없으면 company 이름으로 새 본사 등록
            String companyCode) {}

    /**
     * 로그인·가입·토큰 갱신 응답(앱·웹 공통).
     *   accessToken: API를 부를 때 Authorization: Bearer 로 보낸다(기본 60분)
     *   refreshToken: 접근 토큰이 만료되면 POST /api/auth/refresh { refreshToken } 로 새 접근 토큰을 받는다(기본 30일)
     */
    public record AuthResponse(
            UserDto user,
            String accessToken,
            String refreshToken,
            String tokenType,
            String accessTokenExpiresAt,
            String refreshTokenExpiresAt) {}

    /** 토큰 갱신·로그아웃 요청: { refreshToken } */
    public record RefreshRequest(String refreshToken) {}

    /** 현장 관리자 전환·보고 체계 변경: companyCode 비우면 최고 책임자 */
    public record ManagerRequest(String companyCode, String company, Boolean linkSites) {}
}
