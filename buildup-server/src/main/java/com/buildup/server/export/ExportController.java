package com.buildup.server.export;

import com.buildup.server.auth.CurrentUser;
import com.buildup.server.export.ExportService.ExcelFile;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import org.springframework.web.util.UriUtils;

@RestController
@Tag(name = "06 작업일보 엑셀", description = "작업일보 엑셀 내려받기")
@RequiredArgsConstructor
public class ExportController {

    private static final MediaType XLSX =
            MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

    private final ExportService service;

    public record LinkDto(String url, String from, String to, long expiresInSeconds) {}

    /** 웹 대시보드: 로그인 토큰을 붙여 바로 엑셀 받기. from/to 비우면 최근 7일 */
    @Operation(summary = "웹 대시보드: 로그인 토큰을 붙여 바로 엑셀 받기. from/to 비우면 최근 7일")
    @GetMapping("/api/sites/{siteId}/worklog.xlsx")
    public ResponseEntity<byte[]> download(
            @PathVariable Long siteId,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {
        LocalDate[] p = ExportService.period(from, to);
        return file(service.workLog(CurrentUser.id(), siteId, p[0], p[1]));
    }

    /** 앱: 10분짜리 내려받기 주소 발급 → 앱이 브라우저로 연다 */
    @Operation(summary = "앱: 10분짜리 내려받기 주소 발급 → 앱이 브라우저로 연다")
    @PostMapping("/api/sites/{siteId}/worklog/link")
    public LinkDto link(
            @PathVariable Long siteId,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {
        LocalDate[] p = ExportService.period(from, to);
        String id = service.issueTicket(CurrentUser.id(), siteId, p[0], p[1]);
        String url = ServletUriComponentsBuilder.fromCurrentContextPath()
                .path("/downloads/")
                .path(id)
                .toUriString();
        return new LinkDto(url, p[0].toString(), p[1].toString(), ExportService.LINK_VALID.toSeconds());
    }

    /** 임시 주소(로그인 없이, 주소 자체가 비밀번호 역할) */
    @Operation(summary = "임시 주소(로그인 없이, 주소 자체가 비밀번호 역할)")
    @GetMapping("/downloads/{ticket}")
    public ResponseEntity<byte[]> byTicket(@PathVariable String ticket) {
        return file(service.byTicket(ticket));
    }

    private static ResponseEntity<byte[]> file(ExcelFile f) {
        return ResponseEntity.ok()
                .contentType(XLSX)
                // 한글 파일 이름(filename*)을 못 읽는 프로그램은 영문 이름(filename)으로 저장
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + f.asciiName() + "\"; filename*=UTF-8''"
                        + UriUtils.encode(f.fileName(), StandardCharsets.UTF_8))
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(f.bytes());
    }
}
