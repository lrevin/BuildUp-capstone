package com.buildup.server.system;

import com.buildup.server.auth.CurrentUser;
import com.buildup.server.system.SystemService.SiteRow;
import com.buildup.server.system.SystemService.Stats;
import com.buildup.server.system.SystemService.UserRow;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Tag(name = "08 시스템 관리자", description = "서비스 전체 통계, 계정 관리(사용 중지·다시 사용)")
@RequiredArgsConstructor
public class SystemController {

    private final SystemService service;

    public record DisableRequest(boolean disabled) {}

    @Operation(summary = "서비스 전체 통계(가입자·현장·보고·자재)")
    @GetMapping("/api/system/stats")
    public Stats stats() {
        return service.stats(CurrentUser.id());
    }

    @Operation(summary = "가입자 목록(이름·이메일·회사로 찾기)")
    @GetMapping("/api/system/users")
    public List<UserRow> users(@RequestParam(required = false) String q) {
        return service.users(CurrentUser.id(), q);
    }

    @Operation(summary = "계정 사용 중지 / 다시 사용 { disabled }")
    @PatchMapping("/api/system/users/{userId}")
    public UserRow setDisabled(@PathVariable Long userId, @RequestBody DisableRequest req) {
        return service.setDisabled(CurrentUser.id(), userId, req.disabled());
    }

    @Operation(summary = "전체 현장 목록")
    @GetMapping("/api/system/sites")
    public List<SiteRow> sites() {
        return service.sites(CurrentUser.id());
    }
}
