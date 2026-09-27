package com.buildup.server.hq;

import com.buildup.server.auth.CurrentUser;
import com.buildup.server.hq.HqDtos.HqInfoDto;
import com.buildup.server.material.MaterialDtos.MaterialRequestDto;
import com.buildup.server.report.ReportDtos.ReportDto;
import com.buildup.server.report.ReportDtos.ReportPageDto;
import com.buildup.server.site.SiteDtos.CompanyPreviewDto;
import com.buildup.server.site.SiteDtos.SiteSummaryDto;
import com.buildup.server.site.SiteService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class HqController {

    private final HqService service;
    private final SiteService sites;

    /** 본사 관계자: 본사 정보(코드 포함) */
    @GetMapping("/api/hq")
    public HqInfoDto info() {
        return service.info(CurrentUser.id());
    }

    @GetMapping("/api/hq/sites")
    public List<SiteSummaryDto> sites() {
        return service.sites(CurrentUser.id());
    }

    @GetMapping("/api/hq/reports")
    public List<ReportDto> reports() {
        return service.reports(CurrentUser.id());
    }

    @GetMapping("/api/hq/reports/page")
    public ReportPageDto reportPage(
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false, defaultValue = "30") int size) {
        return service.reportPage(CurrentUser.id(), cursor, size);
    }

    @GetMapping("/api/hq/materials")
    public List<MaterialRequestDto> materials() {
        return service.materials(CurrentUser.id());
    }

    /** 현장 총관리자: 본사 코드로 연결하기 전 본사명 확인 */
    @GetMapping("/api/companies/code/{code}")
    public CompanyPreviewDto preview(@PathVariable String code) {
        return new CompanyPreviewDto(sites.previewCompany(CurrentUser.id(), code));
    }
}
