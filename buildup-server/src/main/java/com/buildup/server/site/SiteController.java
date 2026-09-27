package com.buildup.server.site;

import com.buildup.server.auth.CurrentUser;
import com.buildup.server.site.SiteDtos.CodeDto;
import com.buildup.server.site.SiteDtos.JoinRequest;
import com.buildup.server.site.SiteDtos.MemberDto;
import com.buildup.server.site.SiteDtos.PlanItem;
import com.buildup.server.site.SiteDtos.SiteDto;
import com.buildup.server.site.SiteDtos.SitePreviewDto;
import com.buildup.server.site.SiteDtos.SiteRequest;
import com.buildup.server.site.SiteDtos.SiteSummaryDto;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/sites")
@RequiredArgsConstructor
public class SiteController {

    private final SiteService service;

    @GetMapping
    public List<SiteSummaryDto> mySites() {
        return service.mySites(CurrentUser.id());
    }

    @PostMapping
    public SiteDto create(@Valid @RequestBody SiteRequest req) {
        return service.create(CurrentUser.id(), req);
    }

    @GetMapping("/{siteId}")
    public SiteDto get(@PathVariable Long siteId) {
        return service.get(CurrentUser.id(), siteId);
    }

    @PatchMapping("/{siteId}")
    public SiteDto update(@PathVariable Long siteId, @Valid @RequestBody SiteRequest req) {
        return service.update(CurrentUser.id(), siteId, req);
    }

    @DeleteMapping("/{siteId}")
    public Map<String, Boolean> delete(@PathVariable Long siteId) {
        service.delete(CurrentUser.id(), siteId);
        return Map.of("ok", true);
    }

    @PostMapping("/{siteId}/code")
    public CodeDto regenerateCode(@PathVariable Long siteId) {
        return new CodeDto(service.regenerateCode(CurrentUser.id(), siteId));
    }

    @PutMapping("/{siteId}/plan")
    public SiteDto updatePlan(@PathVariable Long siteId, @RequestBody List<PlanItem> plans) {
        return service.updatePlan(CurrentUser.id(), siteId, plans);
    }

    /** 총관리자: 본사 코드로 현장을 본사에 연결 / 해제 */
    @PutMapping("/{siteId}/hq")
    public SiteDto linkCompany(@PathVariable Long siteId, @RequestBody SiteDtos.CompanyCodeRequest req) {
        return service.linkCompany(CurrentUser.id(), siteId, req.code());
    }

    @DeleteMapping("/{siteId}/hq")
    public SiteDto unlinkCompany(@PathVariable Long siteId) {
        return service.unlinkCompany(CurrentUser.id(), siteId);
    }

    /** 총관리자: 공정 목록 저장(추가·수정·삭제·순서) */
    @PutMapping("/{siteId}/processes")
    public SiteDto updateProcesses(@PathVariable Long siteId, @RequestBody List<SiteDtos.ProcessInput> processes) {
        return service.updateProcesses(CurrentUser.id(), siteId, processes);
    }

    @GetMapping("/code/{code}")
    public SitePreviewDto preview(@PathVariable String code) {
        return service.preview(CurrentUser.id(), code);
    }

    @PostMapping("/join")
    public SiteSummaryDto join(@Valid @RequestBody JoinRequest req) {
        return service.join(CurrentUser.id(), req.code());
    }

    @GetMapping("/{siteId}/members")
    public List<MemberDto> members(@PathVariable Long siteId) {
        return service.members(CurrentUser.id(), siteId);
    }

    /** 작업자: 현장 나가기 (/members/{id}보다 먼저 매칭된다) */
    @DeleteMapping("/{siteId}/members/me")
    public Map<String, Boolean> leave(@PathVariable Long siteId) {
        service.leave(CurrentUser.id(), siteId);
        return Map.of("ok", true);
    }

    @DeleteMapping("/{siteId}/members/{memberId}")
    public Map<String, Boolean> removeMember(@PathVariable Long siteId, @PathVariable Long memberId) {
        service.removeMember(CurrentUser.id(), siteId, memberId);
        return Map.of("ok", true);
    }
}
