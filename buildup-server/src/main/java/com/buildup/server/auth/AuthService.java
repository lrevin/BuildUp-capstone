package com.buildup.server.auth;

import com.buildup.server.auth.AuthDtos.AuthResponse;
import com.buildup.server.auth.AuthDtos.LoginRequest;
import com.buildup.server.auth.AuthDtos.SignUpRequest;
import com.buildup.server.common.ApiException;
import com.buildup.server.common.AttemptLimiter;
import java.time.Duration;
import java.time.Instant;
import com.buildup.server.hq.Company;
import com.buildup.server.hq.CompanyRepository;
import com.buildup.server.user.Role;
import com.buildup.server.user.User;
import com.buildup.server.user.UserDto;
import com.buildup.server.user.UserRepository;
import java.security.SecureRandom;
import java.util.HexFormat;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AuthService {

    private static final SecureRandom RANDOM = new SecureRandom();

    private final UserRepository users;
    private final JwtTokens jwt;
    private final PasswordEncoder passwordEncoder;
    private final CompanyRepository companies;
    private final AttemptLimiter limiter;
    private final RefreshTokens refreshTokens;

    private static final Duration WINDOW = Duration.ofMinutes(10);
    private final com.buildup.server.site.SiteRepository siteRepository;
    private final SignupVerification verification;
    private final KakaoClient kakao;
    private final SocialAccountRepository socials;
    private final Verifications verifications;
    private final org.springframework.transaction.support.TransactionTemplate tx;

    @Transactional
    public AuthResponse login(LoginRequest req) {
        String ip = AttemptLimiter.clientIp();
        String key = "login:" + normalize(req.email()) + "@" + ip;
        String ipKey = "login-ip:" + ip;
        limiter.check(key, 5, WINDOW, "비밀번호를");
        limiter.check(ipKey, 30, WINDOW, "비밀번호를");
        User user = users.findByEmail(normalize(req.email()))
                // 카카오로만 가입한 계정은 비밀번호가 없다
                .filter(u -> u.getPasswordHash() != null && passwordEncoder.matches(req.password(), u.getPasswordHash()))
                .orElse(null);
        if (user == null) {
            limiter.fail(key);
            limiter.fail(ipKey);
            throw ApiException.unauthorized("이메일 또는 비밀번호가 올바르지 않습니다.");
        }
        limiter.clear(key);
        // 비밀번호가 맞을 때만 알려 준다(다른 사람이 계정 상태를 알아낼 수 없게)
        if (user.isWithdrawn()) {
            throw withdrawn();
        }
        if (user.isDisabled()) {
            throw ApiException.forbidden("사용이 중지된 계정이에요. 관리자에게 문의해 주세요.");
        }
        return issue(user);
    }

    private static ApiException withdrawn() {
        return ApiException.forbidden("탈퇴한 계정이에요. 탈퇴 7일 뒤 계정 정보가 모두 삭제돼요.");
    }

    @Transactional
    public AuthResponse signUp(SignUpRequest req) {
        String email = normalize(req.email());
        users.findByEmail(email).ifPresent(u -> {
            throw u.isWithdrawn() ? SignupVerification.withdrawnEmail() : ApiException.conflict("이미 가입된 이메일입니다.");
        });
        SignupVerification.Checked checked = verification.check(req, email);
        try {
            return createUser(req, email, checked);
        } catch (RuntimeException e) {
            // 가입이 안 됐으니 꺼내 쓴 인증을 되돌려 놓는다(다른 칸만 고쳐 다시 보내면 되게)
            checked.undo().run();
            throw e;
        }
    }

    private AuthResponse createUser(SignUpRequest req, String email, SignupVerification.Checked checked) {
        boolean hasPassword = req.password() != null && !req.password().isBlank();
        if (checked.kakao() == null && !hasPassword) {
            throw ApiException.badRequest("비밀번호를 입력해 주세요.");
        }
        Role role = Role.fromApi(req.role());
        User user = new User();
        user.setName(req.name().trim());
        user.setEmail(email);
        user.setPhone(req.phone().trim());
        user.setRole(role);
        if (role == Role.ADMIN) {
            // 본사 코드를 넣었으면 맞는 코드인지만 확인한다. 본사 연결은 현장마다(현장 설정 → 본사 연결)
            String code = req.companyCode() == null ? "" : req.companyCode().trim();
            if (!code.isEmpty()) {
                findCompany("company-code:ip:" + AttemptLimiter.clientIp(), code);
            }
        }
        if (role == Role.HQ) {
            // 새 본사를 등록한 사람 = 본사 관리자(HQ_MANAGER), 본사 코드로 합류한 사람 = 본사 일반 직원(HQ_MEMBER)
            boolean joining = req.companyCode() != null && !req.companyCode().isBlank();
            user.joinCompany(hqCompany(req), !joining);
        }
        user.setPasswordHash(hasPassword ? passwordEncoder.encode(req.password()) : null);
        Instant now = Instant.now();
        user.setEmailVerifiedAt(checked.emailVerified() ? now : null);
        user.setPhoneVerifiedAt(checked.phoneVerified() ? now : null);
        try {
            users.saveAndFlush(user);
        } catch (DataIntegrityViolationException e) {
            // 같은 이메일로 동시에 가입한 경우
            throw ApiException.conflict("이미 가입된 이메일입니다.");
        }
        if (checked.kakao() != null) {
            String kakaoId = checked.kakao().target();
            if (socials.findByProviderAndProviderUserId(SocialAccount.KAKAO, kakaoId).isPresent()) {
                throw ApiException.conflict("이미 가입된 카카오 계정이에요. 카카오로 로그인해 주세요.");
            }
            try {
                socials.saveAndFlush(new SocialAccount(user, SocialAccount.KAKAO, kakaoId,
                        checked.kakao().data().get("email")));
            } catch (DataIntegrityViolationException e) {
                throw ApiException.conflict("이미 가입된 카카오 계정이에요. 카카오로 로그인해 주세요.");
            }
        }
        return issue(user);
    }

    /**
     * 카카오 로그인: 연결된 계정이 있으면 로그인 응답, 처음이면 가입에 쓸 signupToken.
     * 같은 이메일로 이메일 가입한 계정이 있으면 자동으로 연결하지 않는다(남의 계정에 들어가는 것 방지).
     */
    public Object kakaoLogin(AuthDtos.KakaoLoginRequest req) {
        String ipKey = "kakao-ip:" + AttemptLimiter.clientIp();
        limiter.check(ipKey, 30, WINDOW, "카카오 로그인을");
        // 카카오 서버 조회는 DB 작업(트랜잭션) 밖에서: 카카오가 느려도 DB 연결을 붙잡지 않게
        KakaoClient.KakaoUser k;
        try {
            k = req.accessToken() != null && !req.accessToken().isBlank()
                    ? kakao.fromAccessToken(req.accessToken())
                    : kakao.fromCode(req.code(), req.redirectUri());
        } catch (ApiException e) {
            limiter.fail(ipKey);
            throw e;
        }
        return tx.execute(status -> kakaoAccount(k));
    }

    /** 카카오 회원번호로 연결된 계정 찾기 → 로그인 응답 또는 가입 안내 */
    private Object kakaoAccount(KakaoClient.KakaoUser k) {
        var linked = socials.findByProviderAndProviderUserId(SocialAccount.KAKAO, k.id());
        if (linked.isPresent()) {
            User user = linked.get().getUser();
            if (user.isWithdrawn()) {
                throw withdrawn();
            }
            if (user.isDisabled()) {
                throw ApiException.forbidden("사용이 중지된 계정이에요. 관리자에게 문의해 주세요.");
            }
            return issue(user);
        }
        if (k.email() != null && users.existsByEmail(k.email())) {
            throw ApiException.conflict("이미 이메일로 가입된 계정이에요. 이메일로 로그인해 주세요.");
        }
        java.util.Map<String, String> data = new java.util.HashMap<>();
        if (k.email() != null) {
            data.put("email", k.email());
        }
        if (k.nickname() != null) {
            data.put("name", k.nickname());
        }
        String token = verifications.grant(Verifications.Kind.KAKAO, k.id(), data, Verifications.KAKAO_TTL);
        return new AuthDtos.SignupRequiredResponse(true, token, SocialAccount.KAKAO, k.email(), k.nickname(),
                Verifications.KAKAO_TTL.toSeconds());
    }

    /** 본사 관계자: 본사 코드로 합류하거나 새 본사를 등록(6자리 코드 발급) */
    private Company hqCompany(SignUpRequest req) {
        String code = req.companyCode() == null ? "" : req.companyCode().trim();
        if (!code.isEmpty()) {
            return findCompany("company-code:ip:" + AttemptLimiter.clientIp(), code);
        }
        return newCompany(req);
    }

    /** 본사 코드로 본사 찾기(10번 틀리면 10분 막기) */
    private Company findCompany(String key, String code) {
        limiter.check(key, 10, WINDOW, "본사 코드를");
        return companies.findByCode(code).orElseThrow(() -> {
            limiter.fail(key);
            return ApiException.notFound("해당 코드의 본사를 찾을 수 없습니다.\n코드를 다시 확인해 주세요.");
        });
    }

    private Company newCompany(SignUpRequest req) {
        if (req.company() == null || req.company().isBlank()) {
            throw ApiException.badRequest("본사명을 입력해 주세요.");
        }
        Company c = new Company();
        c.setName(req.company().trim());
        c.setCode(newCompanyCode());
        return companies.save(c);
    }

    private String newCompanyCode() {
        String code;
        do {
            code = String.format("%06d", RANDOM.nextInt(1_000_000));
        } while (companies.existsByCode(code));
        return code;
    }

    /**
     * 현장 관리자로 전환하거나 보고 체계를 바꾼다(작업자 → 관리자 가능).
     * companyCode가 비어 있으면 최고 책임자. linkSites면 내가 만든 현장들의 본사 연결도 같이 바꾼다.
     */
    @Transactional
    public UserDto setManager(Long userId, String companyCode, String company, boolean linkSites) {
        User u = users.findById(userId).orElseThrow(() -> ApiException.unauthorized("로그인이 필요합니다."));
        if (u.getRole() == Role.HQ) {
            throw ApiException.badRequest("본사 관계자는 현장 관리자로 바꿀 수 없어요.");
        }
        String code = companyCode == null ? "" : companyCode.trim();
        Company hq = code.isEmpty() ? null : findCompany("company-code:" + userId, code);
        u.setRole(Role.ADMIN);
        // 보고하는 본사는 현장마다 저장된다(DB 설계 V11 sites.company_id): 내가 만든 현장들의 연결을 바꾼다
        if (linkSites) {
            siteRepository.findOwnedBy(userId).forEach(s -> s.setCompany(hq));
        }
        siteRepository.flush();
        return dto(u);
    }

    @Transactional(readOnly = true)
    public UserDto me(Long userId) {
        return users.findById(userId)
                .filter(u -> !u.isWithdrawn())
                .map(this::dto)
                .orElseThrow(() -> ApiException.unauthorized("로그인이 필요합니다."));
    }

    /** 로그아웃: 리프레시 토큰을 바로 무효로(접근 토큰은 만료 시각까지 유효, 앱·웹이 지운다) */
    @Transactional
    public void logout(String accessToken, String refreshToken) {
        refreshTokens.revoke(refreshToken);
    }

    /** 리프레시 토큰으로 새 접근 토큰 받기(리프레시 토큰은 그대로) */
    @Transactional
    public AuthResponse refresh(String refreshToken) {
        RefreshToken rt = refreshTokens.find(refreshToken);
        if (rt.getUser().isWithdrawn()) {
            throw ApiException.unauthorized("로그인이 만료되었어요. 다시 로그인해 주세요.");
        }
        JwtTokens.Issued access = jwt.issue(rt.getUser());
        return new AuthResponse(dto(rt.getUser()), access.value(), refreshToken, "Bearer",
                access.expiresAt().toString(), rt.getExpiresAt().toString());
    }

    /**
     * 비밀번호 재설정(메일로 받은 코드 확인 후). 카카오로만 가입한 계정도 비밀번호를 만들 수 있다.
     * 다른 기기의 로그인은 모두 끊는다(리프레시 토큰 폐기).
     */
    @Transactional
    public void resetPassword(AuthDtos.PasswordResetRequest req) {
        verification.takePasswordReset(req.email(), req.resetToken());
        User u = users.findByEmail(normalize(req.email()))
                .filter(x -> !x.isWithdrawn() && !x.isDisabled())
                .orElseThrow(() -> ApiException.badRequest("인증 시간이 지났어요. 이메일 인증을 다시 해 주세요."));
        u.setPasswordHash(passwordEncoder.encode(req.password()));
        refreshTokens.revokeAll(u.getId());
    }

    /** 로그인·가입 성공 → 접근 토큰 + 리프레시 토큰 발급 */
    private AuthResponse issue(User user) {
        JwtTokens.Issued access = jwt.issue(user);
        RefreshTokens.Issued refresh = refreshTokens.issue(user);
        return new AuthResponse(dto(user), access.value(), refresh.value(), "Bearer",
                access.expiresAt().toString(), refresh.expiresAt().toString());
    }

    /** 사용자 응답(현장 관리자는 보고하는 본사도) */
    private UserDto dto(User u) {
        Company reportingHq = u.getRole() == Role.ADMIN
                ? siteRepository.findFirstByOwnerIdAndCompanyIsNotNullOrderByCreatedAtDescIdDesc(u.getId())
                        .map(com.buildup.server.site.Site::getCompany)
                        .orElse(null)
                : null;
        return UserDto.of(u, reportingHq);
    }

    private static String normalize(String email) {
        return email.trim().toLowerCase();
    }
}
