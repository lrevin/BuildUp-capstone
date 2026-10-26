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
            // 카카오 가입(signupToken)이면 비워도 된다
            @Size(min = 8, max = 64, message = "비밀번호는 8자 이상이어야 해요.") String password,
            @Size(max = 80, message = "회사·본사 이름은 80자까지 쓸 수 있어요.") String company,
            // 본사 관계자: companyCode가 있으면 그 본사에 합류, 없으면 company 이름으로 새 본사 등록
            String companyCode,
            // 이메일 인증 결과(POST /api/auth/email/verify). 카카오가 인증한 이메일이면 생략 가능
            String emailVerificationToken,
            // 휴대폰 인증 결과(POST /api/auth/phone/verify) — 항상 필요
            String phoneVerificationToken,
            // 카카오 첫 로그인 때 받은 가입 토큰(POST /api/auth/oauth/kakao)
            String signupToken) {}

    // ---- 가입 인증(이메일·휴대폰) ----

    public record EmailRequest(
            @NotBlank(message = "이메일을 입력해 주세요.") @Email(message = "이메일 형식이 올바르지 않아요.")
            @Size(max = 120, message = "이메일이 너무 길어요.") String email) {}

    public record EmailVerifyRequest(
            @NotBlank(message = "이메일을 입력해 주세요.") String email,
            @NotBlank(message = "인증 코드를 입력해 주세요.") String code) {}

    /** 비밀번호 재설정 코드 확인 결과(30분 안에 새 비밀번호를 정한다) */
    public record PasswordCodeVerifiedResponse(String resetToken, long expiresInSeconds) {}

    /** 비밀번호 재설정: 코드 확인으로 받은 resetToken + 새 비밀번호 */
    public record PasswordResetRequest(
            @NotBlank(message = "이메일을 입력해 주세요.") String email,
            @NotBlank(message = "이메일 인증을 먼저 해 주세요.") String resetToken,
            @NotBlank(message = "새 비밀번호를 입력해 주세요.")
            @Size(min = 8, max = 64, message = "비밀번호는 8자 이상이어야 해요.") String password) {}

    /** 탈퇴 신청 결과: 이 시각에 계정 정보가 영구 삭제된다 */
    public record WithdrawResponse(boolean ok, String deleteAt) {}

    public record PhoneRequest(@NotBlank(message = "휴대폰 번호를 입력해 주세요.") String phone) {}

    public record PhoneVerifyRequest(
            @NotBlank(message = "휴대폰 번호를 입력해 주세요.") String phone,
            @NotBlank(message = "인증 코드를 입력해 주세요.") String code) {}

    /** 코드를 보냄: 유효 시간과 다시 받을 수 있을 때까지(초) */
    public record CodeSentResponse(long expiresInSeconds, long resendAfterSeconds) {}

    public record EmailVerifiedResponse(String emailVerificationToken, long expiresInSeconds) {}

    public record PhoneVerifiedResponse(String phoneVerificationToken, long expiresInSeconds) {}

    // ---- 카카오 로그인 ----

    /** 웹: { code, redirectUri } / 앱(카카오 SDK): { accessToken } */
    public record KakaoLoginRequest(String code, String redirectUri, String accessToken) {}

    /** 카카오로 처음 온 사람: 가입 화면에서 signupToken을 같이 보낸다(email은 카카오가 인증한 경우에만) */
    public record SignupRequiredResponse(
            boolean signupRequired, String signupToken, String provider, String email, String name,
            long expiresInSeconds) {}

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
