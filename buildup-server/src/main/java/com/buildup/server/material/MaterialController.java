package com.buildup.server.material;

import com.buildup.server.auth.CurrentUser;
import com.buildup.server.material.MaterialDtos.CreateRequest;
import com.buildup.server.material.MaterialDtos.MaterialRequestDto;
import com.buildup.server.material.MaterialDtos.StatusRequest;
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
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Tag(name = "04 자재 요청", description = "자재 요청, 승인·반려, 취소")
@RequiredArgsConstructor
public class MaterialController {

    private final MaterialService service;

    @Operation(summary = "현장 자재 요청 목록")
    @GetMapping("/api/sites/{siteId}/materials")
    public List<MaterialRequestDto> list(@PathVariable Long siteId) {
        return service.list(CurrentUser.id(), siteId);
    }

    @Operation(summary = "자재 요청하기")
    @PostMapping("/api/sites/{siteId}/materials")
    public MaterialRequestDto create(@PathVariable Long siteId, @RequestBody CreateRequest req) {
        return service.create(CurrentUser.id(), siteId, req);
    }

    /** 총관리자·본사: { status: approved | rejected, reason? } */
    @Operation(summary = "총관리자·본사: { status: approved | rejected, reason? }")
    @PatchMapping("/api/materials/{id}/status")
    public MaterialRequestDto changeStatus(@PathVariable Long id, @RequestBody StatusRequest req) {
        return service.changeStatus(CurrentUser.id(), id, req.status(), req.reason());
    }

    /** 작성자: 처리 전 요청 취소 */
    @Operation(summary = "작성자: 처리 전 요청 취소")
    @DeleteMapping("/api/materials/{id}")
    public Map<String, Boolean> cancel(@PathVariable Long id) {
        service.cancel(CurrentUser.id(), id);
        return Map.of("ok", true);
    }
}
