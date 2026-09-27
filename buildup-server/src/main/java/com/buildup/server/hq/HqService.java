package com.buildup.server.hq;

import com.buildup.server.common.ApiException;
import com.buildup.server.hq.HqDtos.HqInfoDto;
import com.buildup.server.material.MaterialDtos.MaterialRequestDto;
import com.buildup.server.material.MaterialService;
import com.buildup.server.report.ReportDtos.ReportDto;
import com.buildup.server.report.ReportDtos.ReportPageDto;
import com.buildup.server.report.ReportService;
import com.buildup.server.site.Site;
import com.buildup.server.site.SiteDtos.SiteSummaryDto;
import com.buildup.server.site.SiteRepository;
import com.buildup.server.site.SiteService;
import com.buildup.server.user.Role;
import com.buildup.server.user.User;
import com.buildup.server.user.UserRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 본사 관계자 화면: 연결된 현장 현황, 현장 보고 모아보기, 자재 요청 접수 */
@Service
@RequiredArgsConstructor
public class HqService {

    private final UserRepository users;
    private final SiteRepository sites;
    private final SiteService siteService;
    private final ReportService reports;
    private final MaterialService materials;

    private Company company(Long userId) {
        User u = users.findById(userId).orElseThrow(() -> ApiException.unauthorized("로그인이 필요합니다."));
        if (u.getRole() != Role.HQ || u.getHqCompany() == null) {
            throw ApiException.forbidden("본사 관계자만 볼 수 있어요.");
        }
        return u.getHqCompany();
    }

    private List<Site> linkedSites(Long userId) {
        return sites.findByCompanyIdOrderById(company(userId).getId());
    }

    @Transactional(readOnly = true)
    public HqInfoDto info(Long userId) {
        Company c = company(userId);
        return new HqInfoDto(
                c.getName(),
                c.getCode(),
                sites.findByCompanyIdOrderById(c.getId()).size(),
                users.findByHqCompanyIdOrderById(c.getId()).stream().map(User::getName).toList());
    }

    @Transactional(readOnly = true)
    public List<SiteSummaryDto> sites(Long userId) {
        return linkedSites(userId).stream().map(s -> siteService.toSummary(s, userId, true)).toList();
    }

    @Transactional(readOnly = true)
    public List<ReportDto> reports(Long userId) {
        return reports.recent(userId, linkedSites(userId).stream().map(Site::getId).toList());
    }

    /** 연결된 모든 현장의 보고를 최신순으로 나눠 불러오기 */
    @Transactional(readOnly = true)
    public ReportPageDto reportPage(Long userId, String cursor, int size) {
        return reports.pageForSites(userId, linkedSites(userId).stream().map(Site::getId).toList(), cursor, size);
    }

    @Transactional(readOnly = true)
    public List<MaterialRequestDto> materials(Long userId) {
        return materials.listForSites(userId, linkedSites(userId).stream().map(Site::getId).toList());
    }
}
