package com.buildup.server.report;

import com.buildup.server.auth.CurrentUser;
import com.buildup.server.common.ApiException;
import com.buildup.server.report.ReportDtos.MemoRequest;
import com.buildup.server.report.ReportDtos.ReportDto;
import com.buildup.server.report.ReportDtos.ReportPageDto;
import com.buildup.server.report.ReportDtos.UnreadRequest;
import com.buildup.server.report.ReportDtos.WorkLogDto;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import tools.jackson.databind.json.JsonMapper;

@RestController
@RequiredArgsConstructor
public class ReportController {

    private final ReportService service;
    private final JsonMapper json;

    @GetMapping("/api/sites/{siteId}/reports")
    public List<ReportDto> list(@PathVariable Long siteId) {
        return service.list(CurrentUser.id(), siteId);
    }

    /** 보고 이력 나눠 불러오기: cursor는 앞 묶음의 nextCursor(첫 묶음은 비움), processKey로 공정만 */
    @GetMapping("/api/sites/{siteId}/reports/page")
    public ReportPageDto page(
            @PathVariable Long siteId,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false, defaultValue = "30") int size,
            @RequestParam(required = false) String processKey) {
        return service.page(CurrentUser.id(), siteId, processKey, cursor, size);
    }

    /** 홈 화면 빨간 숫자: { seen: { 현장ID: 마지막으로 본 시각 } } → { 현장ID: 확인 안 한 보고 수 } */
    @PostMapping("/api/reports/unread")
    public Map<String, Long> unread(@RequestBody UnreadRequest req) {
        return service.unread(CurrentUser.id(), req.seen());
    }

    /** 앱은 multipart/form-data로 보낸다: processKey, to, memo, workLog(JSON 문자열), photos(여러 장), files(첨부 문서) */
    @PostMapping(value = "/api/sites/{siteId}/reports", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ReportDto create(
            @PathVariable Long siteId,
            @RequestParam String processKey,
            @RequestParam double to,
            @RequestParam(required = false, defaultValue = "") String memo,
            @RequestParam(required = false) String workLog,
            @RequestParam(required = false) List<MultipartFile> photos,
            @RequestParam(required = false) List<MultipartFile> files) {
        return service.create(CurrentUser.id(), siteId, processKey, to, memo, parseWorkLog(workLog), photos, files);
    }

    @PatchMapping("/api/reports/{reportId}")
    public ReportDto updateMemo(@PathVariable Long reportId, @RequestBody MemoRequest req) {
        return service.updateMemo(CurrentUser.id(), reportId, req.memo());
    }

    @DeleteMapping("/api/reports/{reportId}")
    public Map<String, Boolean> delete(@PathVariable Long reportId) {
        service.delete(CurrentUser.id(), reportId);
        return Map.of("ok", true);
    }

    private WorkLogDto parseWorkLog(String raw) {
        if (raw == null || raw.isBlank()) {
            return WorkLogDto.EMPTY;
        }
        try {
            return json.readValue(raw, WorkLogDto.class);
        } catch (Exception e) {
            throw ApiException.badRequest("작업 정보 형식이 올바르지 않습니다.");
        }
    }
}
