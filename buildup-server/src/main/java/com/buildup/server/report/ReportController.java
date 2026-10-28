package com.buildup.server.report;

import com.buildup.server.auth.CurrentUser;
import com.buildup.server.common.ApiException;
import com.buildup.server.report.ReportDtos.MaterialUsageDto;
import com.buildup.server.report.ReportDtos.MemoRequest;
import com.buildup.server.report.ReportDtos.ReportDto;
import com.buildup.server.report.ReportDtos.ReportPageDto;
import com.buildup.server.report.ReportDtos.ReviewRequest;
import com.buildup.server.report.ReportDtos.UnreadRequest;
import com.buildup.server.report.ReportDtos.WorkLogDto;
import java.util.List;
import java.util.Map;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
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
@Tag(name = "03 현장 보고", description = "보고 제출(사진·첨부), 목록, 검토(승인·보완 요청), 메모 수정, 삭제")
@RequiredArgsConstructor
public class ReportController {

    private final ReportService service;
    private final JsonMapper json;

    @Operation(summary = "현장 보고 전체 목록(최신순)")
    @GetMapping("/api/sites/{siteId}/reports")
    public List<ReportDto> list(@PathVariable Long siteId) {
        return service.list(CurrentUser.id(), siteId);
    }

    /** 보고 이력 나눠 불러오기: cursor는 앞 묶음의 nextCursor(첫 묶음은 비움) */
    @Operation(summary = "보고 이력 나눠 불러오기: cursor는 앞 묶음의 nextCursor(첫 묶음은 비움)")
    @GetMapping("/api/sites/{siteId}/reports/page")
    public ReportPageDto page(
            @PathVariable Long siteId,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false, defaultValue = "30") int size) {
        return service.page(CurrentUser.id(), siteId, cursor, size);
    }

    /** 홈 화면 빨간 숫자: { seen: { 현장ID: 마지막으로 본 시각 } } → { 현장ID: 확인 안 한 보고 수 } */
    @Operation(summary = "홈 화면 빨간 숫자: { seen: { 현장ID: 마지막으로 본 시각 } } → { 현장ID: 확인 안 한 보고 수 }")
    @PostMapping("/api/reports/unread")
    public Map<String, Long> unread(@RequestBody UnreadRequest req) {
        return service.unread(CurrentUser.id(), req.seen());
    }

    /**
     * 앱은 multipart/form-data로 보낸다: work(진행한 작업), memo, workLog(JSON 문자열), photos(여러 장), files(첨부 문서)
     * 직접 입력 현장: to(현장 전체 진행률) / 자동 계산 현장: processKey(보고할 공정) + processTo(그 공정의 진행률)
     * photoPhases: 사진마다 before(작업 전) | after(작업 후), rating: 현장 관리자의 오늘 작업 평점(0.5~5.0),
     * materials: 오늘 사용한 자재 JSON 문자열 [{ name, quantity, unit }]
     */
    @Operation(summary = "보고 제출(multipart): work, memo, photos, files + 직접 입력이면 to, 자동 계산이면 processKey·processTo")
    @PostMapping(value = "/api/sites/{siteId}/reports", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ReportDto create(
            @PathVariable Long siteId,
            @RequestParam(required = false) String work,
            @RequestParam(required = false) Double to,
            @RequestParam(required = false) String processKey,
            @RequestParam(required = false) Double processTo,
            @RequestParam(required = false, defaultValue = "") String memo,
            @RequestParam(required = false) String workLog,
            @RequestParam(required = false) List<MultipartFile> photos,
            @RequestParam(required = false) List<MultipartFile> files,
            @RequestParam(required = false) Double latitude,
            @RequestParam(required = false) Double longitude,
            @RequestParam(required = false) Double accuracy,
            @RequestParam(required = false) List<String> photoTakenAt,
            @RequestParam(required = false) List<String> photoPhases,
            @RequestParam(required = false) Double rating,
            @RequestParam(required = false) String materials) {
        return service.create(
                CurrentUser.id(), siteId, work, to, processKey, processTo, memo, parseWorkLog(workLog), photos, files,
                new ReportService.SubmitPlace(latitude, longitude, accuracy), photoTakenAt, photoPhases, rating,
                parseMaterials(materials));
    }

    /** 본사 관계자·현장 총관리자: { status: approved | revision, comment } */
    @Operation(summary = "본사 관계자·현장 총관리자: { status: approved | revision, comment }")
    @PatchMapping("/api/reports/{reportId}/review")
    public ReportDto review(@PathVariable Long reportId, @RequestBody ReviewRequest req) {
        return service.review(CurrentUser.id(), reportId, req.status(), req.comment());
    }

    @Operation(summary = "작성자: 메모 수정(보완 요청 받은 보고는 다시 검토 대기)")
    @PatchMapping("/api/reports/{reportId}")
    public ReportDto updateMemo(@PathVariable Long reportId, @RequestBody MemoRequest req) {
        return service.updateMemo(CurrentUser.id(), reportId, req.memo());
    }

    @Operation(summary = "보고 삭제(공정의 가장 최근 보고만)")
    @DeleteMapping("/api/reports/{reportId}")
    public Map<String, Boolean> delete(@PathVariable Long reportId) {
        service.delete(CurrentUser.id(), reportId);
        return Map.of("ok", true);
    }

    private List<MaterialUsageDto> parseMaterials(String raw) {
        if (raw == null || raw.isBlank()) {
            return List.of();
        }
        try {
            return List.of(json.readValue(raw, MaterialUsageDto[].class));
        } catch (Exception e) {
            throw ApiException.badRequest("사용한 자재 형식이 올바르지 않습니다.");
        }
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
