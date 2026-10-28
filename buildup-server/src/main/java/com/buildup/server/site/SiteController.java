package com.buildup.server.site;

import com.buildup.server.auth.CurrentUser;
import com.buildup.server.site.SiteDtos.CodeDto;
import com.buildup.server.site.SiteDtos.JoinRequest;
import com.buildup.server.site.SiteDtos.MemberDto;
import com.buildup.server.site.SiteDtos.SiteDto;
import com.buildup.server.site.SiteDtos.SitePreviewDto;
import com.buildup.server.site.SiteDtos.SiteRequest;
import com.buildup.server.site.SiteDtos.SiteSummaryDto;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
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
@Tag(name = "02 현장·참여 코드", description = "현장 만들기·수정·삭제, 참여 코드, 참여자, 공정, 현장 위치, 본사 연결")
@RequestMapping("/api/sites")
@RequiredArgsConstructor
public class SiteController {

    private final SiteService service;

    @Operation(summary = "내가 참여한 현장 목록")
    @GetMapping
    public List<SiteSummaryDto> mySites() {
        return service.mySites(CurrentUser.id());
    }

    @Operation(summary = "현장 만들기(참여 코드 발급)")
    @PostMapping
    public SiteDto create(@Valid @RequestBody SiteRequest req) {
        return service.create(CurrentUser.id(), req);
    }

    @Operation(summary = "현장 상세(공정·진행률)")
    @GetMapping("/{siteId}")
    public SiteDto get(@PathVariable Long siteId) {
        return service.get(CurrentUser.id(), siteId);
    }

    @Operation(summary = "현장 이름·주소 수정")
    @PatchMapping("/{siteId}")
    public SiteDto update(@PathVariable Long siteId, @Valid @RequestBody SiteRequest req) {
        return service.update(CurrentUser.id(), siteId, req);
    }

    @Operation(summary = "총관리자: 진행률 계산 방식(직접 입력 / 자동 계산)과 공정·가중치 저장",
            description = "{ mode: manual | auto, processes: [{ key?, name, weight }] } — auto면 가중치 합 100")
    @PutMapping("/{siteId}/progress-mode")
    public SiteDto setProgressMode(@PathVariable Long siteId, @RequestBody SiteDtos.ProgressModeRequest req) {
        return service.setProgressMode(CurrentUser.id(), siteId, req.mode(), req.processes());
    }

    @Operation(summary = "현장 삭제")
    /** 최고 책임자: 현장 자재 재고 바꾸기 { materials: [{ name, quantity, unit }] } */
    @PutMapping("/{siteId}/materials")
    public SiteDto setMaterials(@PathVariable Long siteId, @RequestBody SiteDtos.MaterialsRequest req) {
        return service.setMaterials(CurrentUser.id(), siteId, req.materials());
    }

    @DeleteMapping("/{siteId}")
    public Map<String, Boolean> delete(@PathVariable Long siteId) {
        service.delete(CurrentUser.id(), siteId);
        return Map.of("ok", true);
    }

    @Operation(summary = "참여 코드 다시 발급")
    @PostMapping("/{siteId}/code")
    public CodeDto regenerateCode(@PathVariable Long siteId) {
        return new CodeDto(service.regenerateCode(CurrentUser.id(), siteId));
    }

    /** 총관리자: 본사 코드로 현장을 본사에 연결 / 해제 */
    @Operation(summary = "총관리자: 본사 코드로 현장을 본사에 연결 / 해제")
    @PutMapping("/{siteId}/hq")
    public SiteDto linkCompany(@PathVariable Long siteId, @RequestBody SiteDtos.CompanyCodeRequest req) {
        return service.linkCompany(CurrentUser.id(), siteId, req.code());
    }

    @Operation(summary = "총관리자: 본사 연결 해제")
    @DeleteMapping("/{siteId}/hq")
    public SiteDto unlinkCompany(@PathVariable Long siteId) {
        return service.unlinkCompany(CurrentUser.id(), siteId);
    }

    /** 현장 총관리자: 현장 위치 저장 { latitude, longitude } */
    @Operation(summary = "현장 총관리자: 현장 위치 저장 { latitude, longitude }")
    @PutMapping("/{siteId}/location")
    public SiteDto setLocation(@PathVariable Long siteId, @RequestBody SiteDtos.LocationRequest req) {
        return service.setLocation(CurrentUser.id(), siteId, req.latitude(), req.longitude());
    }

    @Operation(summary = "참여 코드로 현장 미리보기")
    @GetMapping("/code/{code}")
    public SitePreviewDto preview(@PathVariable String code) {
        return service.preview(CurrentUser.id(), code);
    }

    @Operation(summary = "참여 코드로 현장 참여")
    @PostMapping("/join")
    public SiteSummaryDto join(@Valid @RequestBody JoinRequest req) {
        return service.join(CurrentUser.id(), req.code());
    }

    @Operation(summary = "참여자 목록")
    @GetMapping("/{siteId}/members")
    public List<MemberDto> members(@PathVariable Long siteId) {
        return service.members(CurrentUser.id(), siteId);
    }

    /** 작업자: 현장 나가기 (/members/{id}보다 먼저 매칭된다) */
    @Operation(summary = "작업자: 현장 나가기 (/members/{id}보다 먼저 매칭된다)")
    @DeleteMapping("/{siteId}/members/me")
    public Map<String, Boolean> leave(@PathVariable Long siteId) {
        service.leave(CurrentUser.id(), siteId);
        return Map.of("ok", true);
    }

    @Operation(summary = "참여자 내보내기")
    @DeleteMapping("/{siteId}/members/{memberId}")
    public Map<String, Boolean> removeMember(@PathVariable Long siteId, @PathVariable Long memberId) {
        service.removeMember(CurrentUser.id(), siteId, memberId);
        return Map.of("ok", true);
    }
}
