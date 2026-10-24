package com.buildup.server.auth;

import com.buildup.server.auth.AuthDtos.AuthResponse;
import com.buildup.server.auth.AuthDtos.LoginRequest;
import com.buildup.server.auth.AuthDtos.SignUpRequest;
import com.buildup.server.common.ApiException;
import com.buildup.server.common.AttemptLimiter;
import java.time.Duration;
import com.buildup.server.hq.Company;
import com.buildup.server.hq.CompanyRepository;
import com.buildup.server.user.Role;
import com.buildup.server.user.User;
import com.buildup.server.user.UserDto;
import com.buildup.server.user.UserRepository;
import java.security.SecureRandom;
import java.util.HexFormat;
import lombok.RequiredArgsConstructor;
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

    @Transactional
    public AuthResponse login(LoginRequest req) {
        String ip = AttemptLimiter.clientIp();
        String key = "login:" + normalize(req.email()) + "@" + ip;
        String ipKey = "login-ip:" + ip;
        limiter.check(key, 5, WINDOW, "비밀번호를");
        limiter.check(ipKey, 30, WINDOW, "비밀번호를");
        User user = users.findByEmail(normalize(req.email()))
                .filter(u -> passwordEncoder.matches(req.password(), u.getPasswordHash()))
                .orElse(null);
        if (user == null) {
            limiter.fail(key);
            limiter.fail(ipKey);
            throw ApiException.unauthorized("이메일 또는 비밀번호가 올바르지 않습니다.");
        }
        limiter.clear(key);
        // 비밀번호가 맞을 때만 알려 준다(다른 사람이 계정 상태를 알아낼 수 없게)
        if (user.isDisabled()) {
            throw ApiException.forbidden("사용이 중지된 계정이에요. 관리자에게 문의해 주세요.");
        }
        return issue(user);
    }

    @Transactional
    public AuthResponse signUp(SignUpRequest req) {
        String email = normalize(req.email());
        if (users.existsByEmail(email)) {
            throw ApiException.conflict("이미 가입된 이메일입니다.");
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
        user.setPasswordHash(passwordEncoder.encode(req.password()));
        users.save(user);
        return issue(user);
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
        JwtTokens.Issued access = jwt.issue(rt.getUser());
        return new AuthResponse(dto(rt.getUser()), access.value(), refreshToken, "Bearer",
                access.expiresAt().toString(), rt.getExpiresAt().toString());
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
