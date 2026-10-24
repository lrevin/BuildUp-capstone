package com.buildup.server.system;

import com.buildup.server.auth.RefreshTokenRepository;
import com.buildup.server.common.ApiException;
import com.buildup.server.common.Times;
import com.buildup.server.hq.CompanyRepository;
import com.buildup.server.material.MaterialRequest;
import com.buildup.server.material.MaterialRequestRepository;
import com.buildup.server.report.Report;
import com.buildup.server.report.ReportRepository;
import com.buildup.server.site.Site;
import com.buildup.server.site.SiteRepository;
import com.buildup.server.user.Role;
import com.buildup.server.user.User;
import com.buildup.server.user.UserRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 시스템 관리자(계획서 6-2의 세 번째 역할): 서비스 전체 현황과 계정 관리 */
@Service
@RequiredArgsConstructor
public class SystemService {

    private final UserRepository users;
    private final SiteRepository sites;
    private final ReportRepository reports;
    private final MaterialRequestRepository materials;
    private final CompanyRepository companies;
    private final RefreshTokenRepository refreshTokens;

    public record Stats(
            Map<String, Long> usersByRole,
            long companies,
            long sites,
            long reports,
            long reportsLast7Days,
            long reportsPendingReview,
            long materialsRequested) {}

    public record UserRow(
            String id,
            String name,
            String email,
            String phone,
            String role,
            String company,
            String createdAt,
            boolean disabled) {

        static UserRow of(User u) {
            String company = u.getCompany();
            return new UserRow(String.valueOf(u.getId()), u.getName(), u.getEmail(), u.getPhone(), u.getRole().api(),
                    company, Times.iso(u.getCreatedAt()), u.isDisabled());
        }
    }

    public record SiteRow(
            String id,
            String name,
            String address,
            String ownerName,
            String hqName,
            int memberCount,
            double overallProgress,
            long reportCount,
            String createdAt) {}

    private void requireSystem(Long userId) {
        User u = users.findById(userId).orElseThrow(() -> ApiException.unauthorized("로그인이 필요합니다."));
        if (u.getRole() != Role.SYSTEM) {
            throw ApiException.forbidden("시스템 관리자만 볼 수 있어요.");
        }
    }

    @Transactional(readOnly = true)
    public Stats stats(Long userId) {
        requireSystem(userId);
        Map<String, Long> byRole = new LinkedHashMap<>();
        Arrays.stream(Role.values()).forEach(r -> byRole.put(r.api(), 0L));
        users.findAll().forEach(u -> byRole.merge(u.getRole().api(), 1L, Long::sum));
        return new Stats(
                byRole,
                companies.count(),
                sites.count(),
                reports.count(),
                reports.countByCreatedAtAfter(Instant.now().minus(7, ChronoUnit.DAYS)),
                reports.countByReviewStatus(Report.PENDING),
                materials.countByStatus(MaterialRequest.REQUESTED));
    }

    @Transactional(readOnly = true)
    public List<UserRow> users(Long userId, String q) {
        requireSystem(userId);
        String query = q == null ? "" : q.trim().toLowerCase();
        return users.findAll().stream()
                .filter(u -> query.isEmpty()
                        || u.getName().toLowerCase().contains(query)
                        || u.getEmail().toLowerCase().contains(query)
                        || (u.getCompany() != null && u.getCompany().toLowerCase().contains(query)))
                .sorted((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt()))
                .limit(500)
                .map(UserRow::of)
                .toList();
    }

    /** 계정 사용 중지: 바로 로그아웃시키고 다시 로그인하지 못하게 한다. 자기 자신·다른 시스템 관리자는 불가 */
    @Transactional
    public UserRow setDisabled(Long userId, Long targetId, boolean disabled) {
        requireSystem(userId);
        User target = users.findById(targetId).orElseThrow(() -> ApiException.notFound("사용자를 찾을 수 없습니다."));
        if (target.getId().equals(userId) || target.getRole() == Role.SYSTEM) {
            throw ApiException.forbidden("시스템 관리자 계정은 여기서 바꿀 수 없어요.");
        }
        target.setDisabled(disabled);
        if (disabled) {
            // 다시 로그인·토큰 갱신을 못 하게(접근 토큰도 요청마다 사용 중지 여부를 확인한다)
            Instant now = Instant.now();
            refreshTokens.findByUserIdAndRevokedAtIsNull(target.getId()).forEach(t -> t.setRevokedAt(now));
        }
        return UserRow.of(target);
    }

    @Transactional(readOnly = true)
    public List<SiteRow> sites(Long userId) {
        requireSystem(userId);
        return sites.findAll().stream()
                .sorted((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt()))
                .map(this::row)
                .toList();
    }

    private SiteRow row(Site s) {
        return new SiteRow(
                String.valueOf(s.getId()),
                s.getName(),
                s.getAddress(),
                s.getOwner().getName(),
                s.getCompany() == null ? null : s.getCompany().getName(),
                s.getMembers().size(),
                s.overallProgress(),
                reports.countBySiteId(s.getId()),
                Times.iso(s.getCreatedAt()));
    }
}
