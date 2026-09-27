package com.buildup.server.site;

import com.buildup.server.common.ApiException;
import com.buildup.server.common.AttemptLimiter;
import com.buildup.server.common.Times;
import com.buildup.server.hq.Company;
import com.buildup.server.hq.CompanyRepository;
import com.buildup.server.material.MaterialRequest;
import com.buildup.server.material.MaterialRequestRepository;
import com.buildup.server.report.Report;
import com.buildup.server.report.ReportRepository;
import com.buildup.server.report.FileStorage;
import com.buildup.server.site.SiteDtos.MemberDto;
import com.buildup.server.site.SiteDtos.PlanItem;
import com.buildup.server.site.SiteDtos.ProcessDto;
import com.buildup.server.site.SiteDtos.SiteDto;
import com.buildup.server.site.SiteDtos.SitePreviewDto;
import com.buildup.server.site.SiteDtos.SiteRequest;
import com.buildup.server.site.SiteDtos.SiteSummaryDto;
import com.buildup.server.user.Role;
import com.buildup.server.user.User;
import com.buildup.server.user.UserRepository;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 현장·참여 코드·참여자·공정 계획 (권한 규칙은 앱 src/data/dummy.ts와 같다) */
@Service
@RequiredArgsConstructor
public class SiteService {

    private static final SecureRandom RANDOM = new SecureRandom();

    /** 새 현장의 기본 공정: [키, 이름, 비중] */
    public static final List<Object[]> DEFAULT_PROCESSES = List.of(
            new Object[] {"frame", "골조", 0.4},
            new Object[] {"electric", "전기", 0.2},
            new Object[] {"plumbing", "설비", 0.2},
            new Object[] {"finish", "마감", 0.2});

    private final SiteRepository sites;
    private final UserRepository users;
    private final ReportRepository reports;
    private final FileStorage files;
    private final MaterialRequestRepository materials;
    private final CompanyRepository companies;
    private final AttemptLimiter limiter;

    private static final java.time.Duration CODE_WINDOW = java.time.Duration.ofMinutes(10);

    /** 6자리 코드로 찾기: 틀리면 기록, 10번 틀리면 10분 막기 */
    private <T> T byCode(String key, java.util.Optional<T> found, String notFoundMessage) {
        limiter.check(key, 10, CODE_WINDOW, "코드를");
        if (found.isEmpty()) {
            limiter.fail(key);
            throw ApiException.notFound(notFoundMessage);
        }
        return found.get();
    }

    // ---- 조회 도우미 ----

    /** 참여한 현장만 접근 가능 */
    public Site memberSite(Long userId, Long siteId) {
        Site site = sites.findById(siteId).orElseThrow(() -> ApiException.notFound("현장을 찾을 수 없습니다."));
        if (!site.hasMember(userId)) {
            throw ApiException.forbidden("참여하지 않은 현장입니다.");
        }
        return site;
    }

    /** 조회만: 참여자 또는 이 현장이 연결된 본사의 관계자 */
    public Site viewableSite(Long userId, Long siteId) {
        Site site = sites.findById(siteId).orElseThrow(() -> ApiException.notFound("현장을 찾을 수 없습니다."));
        if (!site.hasMember(userId) && !site.isHqOf(user(userId))) {
            throw ApiException.forbidden("볼 수 있는 현장이 아닙니다.");
        }
        return site;
    }

    private Site ownedSite(Long userId, Long siteId, String action) {
        Site site = memberSite(userId, siteId);
        if (!site.isOwner(userId)) {
            throw ApiException.forbidden("현장 총관리자만 " + action + "할 수 있습니다.");
        }
        return site;
    }

    private User user(Long userId) {
        return users.findById(userId).orElseThrow(() -> ApiException.unauthorized("로그인이 필요합니다."));
    }

    public String newCode() {
        String code;
        do {
            code = String.format("%06d", RANDOM.nextInt(1_000_000));
        } while (sites.existsByCode(code));
        return code;
    }

    public static void addDefaultProcesses(Site site) {
        for (int i = 0; i < DEFAULT_PROCESSES.size(); i++) {
            Object[] d = DEFAULT_PROCESSES.get(i);
            site.getProcesses().add(new SiteProcess(site, (String) d[0], (String) d[1], (double) d[2], i));
        }
    }

    // ---- 변환 ----

    SiteDto toDto(Site s, Long userId) {
        return new SiteDto(
                String.valueOf(s.getId()),
                s.getName(),
                s.getAddress(),
                String.valueOf(s.getOwner().getId()),
                s.getOwner().getName(),
                s.isOwner(userId) ? s.getCode() : null,
                s.getMembers().size(),
                s.overallProgress(),
                s.getProcesses().stream().map(ProcessDto::of).toList(),
                s.getCompany() == null ? null : s.getCompany().getName(),
                s.getLatitude(),
                s.getLongitude());
    }

    private SiteSummaryDto toSummary(Site s, Long userId) {
        return toSummary(s, userId, false);
    }

    /** 본사 화면에서도 같은 요약을 쓴다(대기 자재 = 승인·반려를 기다리는 요청) */
    public SiteSummaryDto toSummary(Site s, Long userId, boolean forHq) {
        int today = (int) s.getProcesses().stream()
                .filter(p -> Times.isToday(p.getLastReportedAt()))
                .count();
        return new SiteSummaryDto(
                String.valueOf(s.getId()),
                s.getName(),
                s.getAddress(),
                s.getOwner().getName(),
                s.getMembers().size(),
                s.overallProgress(),
                s.isOwner(userId),
                today,
                s.getProcesses().size(),
                PlanCalc.overallPlanned(s.getProcesses(), Instant.now()),
                s.getCompany() == null ? null : s.getCompany().getName(),
                (int) materials.countBySiteIdAndStatus(s.getId(), MaterialRequest.REQUESTED),
                pendingReviews(s, userId, forHq));
    }

    /** 내가 검토(승인·보완 요청)할 수 있는 대기 보고 수: 본사는 전부, 현장 총관리자는 남이 쓴 보고 */
    private int pendingReviews(Site s, Long userId, boolean forHq) {
        if (forHq) {
            return (int) reports.countBySiteIdAndReviewStatus(s.getId(), Report.PENDING);
        }
        if (s.isOwner(userId)) {
            return (int) reports.countBySiteIdAndReviewStatusAndAuthorIdNot(s.getId(), Report.PENDING, userId);
        }
        return 0;
    }

    /** 현장 총관리자: 현장 위치 저장(보고 위치가 현장과 먼지 확인하는 기준) */
    @Transactional
    public SiteDto setLocation(Long userId, Long siteId, Double latitude, Double longitude) {
        Site site = ownedSite(userId, siteId, "현장 위치를 저장");
        if ((latitude == null) != (longitude == null)) {
            throw ApiException.badRequest("위도와 경도를 함께 보내 주세요.");
        }
        if (latitude != null && (Math.abs(latitude) > 90 || Math.abs(longitude) > 180)) {
            throw ApiException.badRequest("위치 값이 올바르지 않습니다.");
        }
        site.setLatitude(latitude);
        site.setLongitude(longitude);
        site.setLocationUpdatedAt(latitude == null ? null : Instant.now());
        return toDto(site, userId);
    }

    // ---- 현장 ----

    @Transactional(readOnly = true)
    public List<SiteSummaryDto> mySites(Long userId) {
        return sites.findJoinedBy(userId).stream().map(s -> toSummary(s, userId)).toList();
    }

    @Transactional(readOnly = true)
    public SiteDto get(Long userId, Long siteId) {
        return toDto(viewableSite(userId, siteId), userId);
    }

    @Transactional
    public SiteDto create(Long userId, SiteRequest req) {
        User owner = user(userId);
        if (owner.getRole() != Role.ADMIN) {
            throw ApiException.forbidden("현장 관리자만 현장을 만들 수 있어요. 내 정보에서 현장 관리자로 전환해 주세요.");
        }
        Site site = new Site();
        site.setName(req.name().trim());
        site.setAddress(req.address().trim());
        site.setOwner(owner);
        site.setCode(newCode());
        // 보고하는 본사가 있으면 새 현장도 그 본사에 연결(없으면 최고 책임자 현장)
        site.setCompany(owner.getManagerCompany());
        // 공정은 총관리자가 '공정 관리'에서 직접 만든다(고정 공정 없음)
        site.getMembers().add(new SiteMember(site, owner, Instant.now()));
        sites.save(site);
        return toDto(site, userId);
    }

    @Transactional
    public SiteDto update(Long userId, Long siteId, SiteRequest req) {
        Site site = ownedSite(userId, siteId, "현장 정보를 수정");
        site.setName(req.name().trim());
        site.setAddress(req.address().trim());
        return toDto(site, userId);
    }

    @Transactional
    public void delete(Long userId, Long siteId) {
        Site site = ownedSite(userId, siteId, "현장을 삭제");
        List<Report> siteReports = reports.findAllBySiteId(siteId);
        siteReports.forEach(r -> files.deleteAfterCommit(r.photoFiles(), r.getFiles()));
        reports.deleteAll(siteReports);
        materials.deleteAll(materials.findAllBySiteId(siteId));
        sites.delete(site);
    }

    @Transactional
    public String regenerateCode(Long userId, Long siteId) {
        Site site = ownedSite(userId, siteId, "코드를 재발급");
        site.setCode(newCode());
        return site.getCode();
    }

    @Transactional
    public SiteDto updatePlan(Long userId, Long siteId, List<PlanItem> plans) {
        Site site = ownedSite(userId, siteId, "공정 계획을 수정");
        for (PlanItem plan : plans) {
            LocalDate start = Times.parseYmd(plan.planStart());
            LocalDate end = Times.parseYmd(plan.planEnd());
            if ((start == null) != (end == null)) {
                throw ApiException.badRequest("시작일과 완료일을 모두 정해 주세요.");
            }
            if (start != null && start.isAfter(end)) {
                throw ApiException.badRequest("완료일은 시작일보다 늦어야 합니다.");
            }
            site.getProcesses().stream()
                    .filter(p -> p.getKey().equals(plan.key()))
                    .findFirst()
                    .ifPresent(p -> {
                        p.setPlanStart(start);
                        p.setPlanEnd(end);
                    });
        }
        return toDto(site, userId);
    }

    // ---- 본사 연결 ----

    /** 총관리자: 본사 코드로 연결하기 전에 본사명 확인 */
    @Transactional(readOnly = true)
    public String previewCompany(Long userId, String code) {
        return byCode("company-code:" + userId, companies.findByCode(code),
                        "해당 코드의 본사를 찾을 수 없습니다.\n코드를 다시 확인해 주세요.")
                .getName();
    }

    @Transactional
    public SiteDto linkCompany(Long userId, Long siteId, String code) {
        Site site = ownedSite(userId, siteId, "본사를 연결");
        Company company = byCode("company-code:" + userId, companies.findByCode(code == null ? "" : code.trim()),
                "해당 코드의 본사를 찾을 수 없습니다.");
        site.setCompany(company);
        return toDto(site, userId);
    }

    @Transactional
    public SiteDto unlinkCompany(Long userId, Long siteId) {
        Site site = ownedSite(userId, siteId, "본사 연결을 해제");
        site.setCompany(null);
        return toDto(site, userId);
    }

    // ---- 공정 관리 ----

    public static final int MAX_PROCESSES = 30;

    /** 총관리자: 공정 목록을 통째로 저장(추가·이름 변경·비중·계획·순서·삭제) */
    @Transactional
    public SiteDto updateProcesses(Long userId, Long siteId, List<SiteDtos.ProcessInput> inputs) {
        Site site = ownedSite(userId, siteId, "공정을 수정");
        if (inputs == null) {
            inputs = List.of();
        }
        if (inputs.size() > MAX_PROCESSES) {
            throw ApiException.badRequest("공정은 " + MAX_PROCESSES + "개까지 만들 수 있어요.");
        }
        java.util.Set<String> names = new java.util.HashSet<>();
        java.util.Set<String> keptKeys = new java.util.HashSet<>();
        for (SiteDtos.ProcessInput in : inputs) {
            String name = in.name() == null ? "" : in.name().trim();
            if (name.isEmpty()) {
                throw ApiException.badRequest("공정 이름을 입력해 주세요.");
            }
            if (name.length() > 30) {
                throw ApiException.badRequest("공정 이름은 30자까지 쓸 수 있어요.");
            }
            if (!names.add(name)) {
                throw ApiException.badRequest("'" + name + "' 공정이 두 번 들어 있어요.");
            }
            double w = in.weight() == null ? 1 : in.weight();
            if (w <= 0 || w > 1000) {
                throw ApiException.badRequest("'" + name + "' 공정의 비중을 확인해 주세요.");
            }
            LocalDate start = Times.parseYmd(in.planStart());
            LocalDate end = Times.parseYmd(in.planEnd());
            if ((start == null) != (end == null)) {
                throw ApiException.badRequest("'" + name + "' 공정의 시작일과 완료일을 모두 정해 주세요.");
            }
            if (start != null && start.isAfter(end)) {
                throw ApiException.badRequest("'" + name + "' 공정의 완료일은 시작일보다 늦어야 합니다.");
            }
            if (in.key() != null && !in.key().isBlank()) {
                keptKeys.add(in.key());
            }
        }
        // 빠진 공정 삭제: 보고가 있는 공정은 기록을 지키기 위해 막는다
        for (SiteProcess p : site.getProcesses()) {
            if (!keptKeys.contains(p.getKey()) && reports.existsBySiteIdAndProcessKey(siteId, p.getKey())) {
                throw ApiException.conflict("'" + p.getName() + "' 공정에는 보고가 있어 삭제할 수 없어요. 이름은 바꿀 수 있어요.");
            }
        }
        site.getProcesses().removeIf(p -> !keptKeys.contains(p.getKey()));

        for (int i = 0; i < inputs.size(); i++) {
            SiteDtos.ProcessInput in = inputs.get(i);
            SiteProcess p = in.key() == null ? null : site.getProcesses().stream()
                    .filter(x -> x.getKey().equals(in.key()))
                    .findFirst()
                    .orElse(null);
            if (p == null) {
                p = new SiteProcess(site, newProcessKey(site), in.name().trim(), 1, i);
                site.getProcesses().add(p);
            }
            p.setName(in.name().trim());
            p.setWeight(in.weight() == null ? 1 : in.weight());
            p.setPlanStart(Times.parseYmd(in.planStart()));
            p.setPlanEnd(Times.parseYmd(in.planEnd()));
            p.setSortOrder(i);
        }
        site.getProcesses().sort(Comparator.comparingInt(SiteProcess::getSortOrder));
        sites.flush();
        return toDto(site, userId);
    }

    private static String newProcessKey(Site site) {
        String key;
        do {
            key = "p" + Integer.toHexString(RANDOM.nextInt(0x10000000));
        } while (hasKey(site, key));
        return key;
    }

    private static boolean hasKey(Site site, String key) {
        return site.getProcesses().stream().anyMatch(p -> p.getKey().equals(key));
    }

    // ---- 코드 참여 ----

    @Transactional(readOnly = true)
    public SitePreviewDto preview(Long userId, String code) {
        Site s = byCode("site-code:" + userId, sites.findByCode(code),
                "해당 코드의 현장을 찾을 수 없습니다.\n코드를 다시 확인해 주세요.");
        return new SitePreviewDto(
                String.valueOf(s.getId()),
                s.getName(),
                s.getAddress(),
                s.getOwner().getName(),
                s.getMembers().size(),
                s.hasMember(userId));
    }

    @Transactional
    public SiteSummaryDto join(Long userId, String code) {
        if (user(userId).getRole() == Role.HQ || user(userId).getRole() == Role.SYSTEM) {
            throw ApiException.forbidden("본사 관계자는 현장 총관리자가 본사 코드로 연결한 현장을 볼 수 있어요.");
        }
        Site s = byCode("site-code:" + userId, sites.findByCode(code), "해당 코드의 현장을 찾을 수 없습니다.");
        if (!s.hasMember(userId)) {
            s.getMembers().add(new SiteMember(s, user(userId), Instant.now()));
        }
        return toSummary(s, userId);
    }

    // ---- 참여자 ----

    @Transactional(readOnly = true)
    public List<MemberDto> members(Long userId, Long siteId) {
        Site s = viewableSite(userId, siteId);
        return s.getMembers().stream()
                .map(m -> new MemberDto(
                        String.valueOf(m.getUser().getId()),
                        m.getUser().getName(),
                        m.getUser().getPhone(),
                        s.isOwner(m.getUser().getId()) ? "admin" : "worker",
                        s.isOwner(m.getUser().getId()),
                        Times.iso(m.getJoinedAt()),
                        reports.countBySiteIdAndAuthorId(siteId, m.getUser().getId())))
                // 관리자 먼저, 그다음 참여 순
                .sorted(Comparator.comparing(MemberDto::isOwner).reversed().thenComparing(MemberDto::joinedAt))
                .toList();
    }

    @Transactional
    public void removeMember(Long userId, Long siteId, Long memberId) {
        Site s = ownedSite(userId, siteId, "참여자를 내보낼");
        if (memberId.equals(userId)) {
            throw ApiException.badRequest("본인은 내보낼 수 없습니다.");
        }
        s.getMembers().removeIf(m -> m.getUser().getId().equals(memberId));
    }

    @Transactional
    public void leave(Long userId, Long siteId) {
        Site s = memberSite(userId, siteId);
        if (s.isOwner(userId)) {
            throw ApiException.badRequest("현장 총관리자는 현장을 나갈 수 없습니다.");
        }
        s.getMembers().removeIf(m -> m.getUser().getId().equals(userId));
    }
}
