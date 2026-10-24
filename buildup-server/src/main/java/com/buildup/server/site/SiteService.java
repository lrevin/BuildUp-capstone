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
import com.buildup.server.site.SiteDtos.ProcessDto;
import com.buildup.server.site.SiteDtos.ProcessInput;
import com.buildup.server.site.SiteDtos.SiteDto;
import com.buildup.server.site.SiteDtos.SitePreviewDto;
import com.buildup.server.site.SiteDtos.SiteRequest;
import com.buildup.server.site.SiteDtos.SiteSummaryDto;
import com.buildup.server.user.Role;
import com.buildup.server.user.User;
import com.buildup.server.user.UserRepository;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 현장·공사 종류·참여 코드·참여자 (권한 규칙은 앱 src/data/dummy.ts와 같다) */
@Service
@RequiredArgsConstructor
public class SiteService {

    private static final SecureRandom RANDOM = new SecureRandom();

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
        } while (Site.DEMO_CODE.equals(code) || sites.existsByCode(code));
        return code;
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
                s.getWorkType(),
                Times.iso(s.getLastReportedAt()),
                s.getCompany() == null ? null : s.getCompany().getName(),
                s.getLatitude(),
                s.getLongitude(),
                mode(s),
                processes(s));
    }

    private static String mode(Site s) {
        return s.isAuto() ? Site.MODE_AUTO : Site.MODE_MANUAL;
    }

    /** 공정 목록(가중치는 합계 100%로 맞춰서) */
    private static List<ProcessDto> processes(Site s) {
        double total = s.getProcesses().stream().mapToDouble(SiteProcess::getWeight).sum();
        return s.getProcesses().stream()
                .map(p -> new ProcessDto(
                        p.getKey(),
                        p.getName(),
                        total > 0 ? Math.round(p.getWeight() / total * 1000) / 10.0 : 0,
                        p.getProgress(),
                        Times.iso(p.getLastReportedAt())))
                .toList();
    }

    private SiteSummaryDto toSummary(Site s, Long userId) {
        return toSummary(s, userId, false);
    }

    /** 본사 화면에서도 같은 요약을 쓴다(대기 자재 = 승인·반려를 기다리는 요청) */
    public SiteSummaryDto toSummary(Site s, Long userId, boolean forHq) {
        return new SiteSummaryDto(
                String.valueOf(s.getId()),
                s.getName(),
                s.getAddress(),
                s.getOwner().getName(),
                s.getMembers().size(),
                s.overallProgress(),
                s.isOwner(userId),
                s.getWorkType(),
                Times.iso(s.getLastReportedAt()),
                s.getCompany() == null ? null : s.getCompany().getName(),
                (int) materials.countBySiteIdAndStatus(s.getId(), MaterialRequest.REQUESTED),
                pendingReviews(s, userId, forHq),
                mode(s));
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
        site.setWorkType(workType(req.workType()));
        site.setProgressMode(Site.MODE_MANUAL);
        // 보고하는 본사가 있으면 새 현장도 그 본사에 연결(= 가장 최근에 만든, 본사에 연결된 내 현장의 본사)
        site.setCompany(sites.findFirstByOwnerIdAndCompanyIsNotNullOrderByCreatedAtDescIdDesc(userId)
                .map(Site::getCompany)
                .orElse(null));
        site.getMembers().add(new SiteMember(site, owner, Instant.now()));
        if (Site.MODE_AUTO.equals(req.progressMode())) {
            applyMode(site, Site.MODE_AUTO, req.processes());
        }
        sites.save(site);
        return toDto(site, userId);
    }

    /** 총관리자: 진행률 계산 방식(직접 입력 / 자동 계산)과 공정·가중치 바꾸기 */
    @Transactional
    public SiteDto setProgressMode(Long userId, Long siteId, String mode, List<ProcessInput> processes) {
        Site site = ownedSite(userId, siteId, "진행률 계산 방식을 바꾸");
        applyMode(site, mode, processes);
        return toDto(site, userId);
    }

    private static final int MAX_PROCESSES = 12;

    private void applyMode(Site site, String mode, List<ProcessInput> input) {
        if (Site.MODE_MANUAL.equals(mode)) {
            // 자동 → 직접: 공정은 남겨 둔다. 다음 직접 입력 보고 전까지는 공정으로 계산한 값에서 이어진다
            site.setProgressMode(Site.MODE_MANUAL);
            return;
        }
        if (!Site.MODE_AUTO.equals(mode)) {
            throw ApiException.badRequest("진행률 계산 방식은 manual 또는 auto예요.");
        }
        List<ProcessInput> list = input == null ? List.of() : input;
        if (list.isEmpty()) {
            throw ApiException.badRequest("자동 계산을 쓰려면 공정을 하나 이상 넣어 주세요.");
        }
        if (list.size() > MAX_PROCESSES) {
            throw ApiException.badRequest("공정은 " + MAX_PROCESSES + "개까지 넣을 수 있어요.");
        }
        Set<String> names = new HashSet<>();
        double sum = 0;
        for (ProcessInput p : list) {
            String name = p.name() == null ? "" : p.name().trim();
            if (name.isEmpty() || name.length() > 30) {
                throw ApiException.badRequest("공정 이름은 1~30자로 적어 주세요.");
            }
            if (!names.add(name)) {
                throw ApiException.badRequest("공정 이름 '" + name + "'이(가) 겹쳐요.");
            }
            if (p.weight() == null || !Double.isFinite(p.weight()) || p.weight() <= 0) {
                throw ApiException.badRequest("'" + name + "' 공정의 가중치를 0보다 크게 적어 주세요.");
            }
            sum += p.weight();
        }
        if (Math.abs(sum - 100) > 0.5) {
            throw ApiException.badRequest("가중치 합계가 100%가 되어야 해요. (지금 " + Math.round(sum * 10) / 10.0 + "%)");
        }

        boolean wasAuto = site.isAuto();
        double current = site.overallProgress();
        List<SiteProcess> kept = new ArrayList<>();
        int next = site.getProcesses().stream()
                .map(SiteProcess::getKey)
                .filter(k -> k.matches("p\\d+"))
                .mapToInt(k -> Integer.parseInt(k.substring(1)))
                .max().orElse(0) + 1;
        for (int i = 0; i < list.size(); i++) {
            ProcessInput in = list.get(i);
            SiteProcess p = in.key() == null ? null : site.getProcesses().stream()
                    .filter(x -> x.getKey().equals(in.key()))
                    .findFirst().orElse(null);
            if (p == null) {
                // 새 공정: 이미 자동 계산 중이면 0%에서, 직접 입력에서 바꾸는 중이면 지금 진행률에서 시작
                p = new SiteProcess(site, "p" + next++, in.name().trim(), in.weight(), i);
                p.setProgress(wasAuto ? 0 : current);
            } else {
                p.setName(in.name().trim());
                p.setWeight(in.weight());
                p.setSortOrder(i);
                if (!wasAuto) {
                    p.setProgress(current); // 직접 입력 → 자동: 지금 진행률에서 이어서
                }
            }
            kept.add(p);
        }
        site.getProcesses().removeIf(p -> !kept.contains(p));
        for (SiteProcess p : kept) {
            if (!site.getProcesses().contains(p)) {
                site.getProcesses().add(p);
            }
        }
        site.getProcesses().sort(Comparator.comparingInt(SiteProcess::getSortOrder));
        site.setProgressMode(Site.MODE_AUTO);
    }

    @Transactional
    public SiteDto update(Long userId, Long siteId, SiteRequest req) {
        Site site = ownedSite(userId, siteId, "현장 정보를 수정");
        site.setName(req.name().trim());
        site.setAddress(req.address().trim());
        if (req.workType() != null) {
            site.setWorkType(workType(req.workType()));
        }
        return toDto(site, userId);
    }

    /** 공사 종류: 목록에서 고르거나 직접 입력(필수) */
    private static String workType(String value) {
        String v = value == null ? "" : value.trim();
        if (v.isEmpty()) {
            throw ApiException.badRequest("공사 종류를 골라 주세요.");
        }
        return v;
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
        if (Site.DEMO_CODE.equals(site.getCode())) {
            throw ApiException.badRequest("데모 현장 코드는 000000으로 고정이라 바꿀 수 없어요.");
        }
        site.setCode(newCode());
        return site.getCode();
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
