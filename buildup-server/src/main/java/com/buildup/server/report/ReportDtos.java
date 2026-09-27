package com.buildup.server.report;

import com.buildup.server.common.Times;
import java.util.List;

/** 보고 요청/응답 모양(앱 src/types.ts의 Report, WorkLog와 같음) */
public final class ReportDtos {

    private ReportDtos() {}

    public record WorkLogDto(String weather, Integer workers, String equipment) {

        public static final WorkLogDto EMPTY = new WorkLogDto(null, null, "");

        static WorkLogDto of(Report r) {
            return new WorkLogDto(r.getWeather(), r.getWorkers(), r.getEquipment());
        }
    }

    public record FileDto(String name, String url, long size) {

        static FileDto of(ReportFile f) {
            return new FileDto(f.getName(), FileStorage.docUrl(f.getPath()), f.getSize());
        }
    }

    public record ReportDto(
            String id,
            String siteId,
            String siteName,
            String processKey,
            String processName,
            double from,
            double to,
            List<String> photoUris,
            List<FileDto> files,
            String memo,
            WorkLogDto workLog,
            String author,
            String authorId,
            String createdAt,
            String updatedAt,
            boolean canEdit,
            boolean canDelete) {

        static ReportDto of(Report r, boolean canEdit, boolean canDelete) {
            return new ReportDto(
                    String.valueOf(r.getId()),
                    String.valueOf(r.getSite().getId()),
                    r.getSite().getName(),
                    r.getProcessKey(),
                    r.getProcessName(),
                    r.getFromProgress(),
                    r.getToProgress(),
                    r.getPhotos().stream().map(FileStorage::url).toList(),
                    r.getFiles().stream().map(FileDto::of).toList(),
                    r.getMemo(),
                    WorkLogDto.of(r),
                    r.getAuthor().getName(),
                    String.valueOf(r.getAuthor().getId()),
                    Times.iso(r.getCreatedAt()),
                    Times.iso(r.getUpdatedAt()),
                    canEdit,
                    canDelete);
        }
    }

    public record MemoRequest(String memo) {}

    /**
     * 나눠 불러온 보고 한 묶음.
     * nextCursor: 다음 묶음을 부를 때 그대로 넘기는 값(더 없으면 null)
     * total, processes: 첫 묶음에만(보고 이력 화면의 '전체 40', '전기 11' 필터). 나머지 묶음은 null
     */
    public record ReportPageDto(
            List<ReportDto> items, String nextCursor, Long total, List<ProcessCountDto> processes) {}

    public record ProcessCountDto(String key, String name, long count) {}

    /** 확인하지 않은 보고 수 요청: { seen: { 현장ID: 마지막으로 본 시각(ISO) 또는 null } } */
    public record UnreadRequest(java.util.Map<String, String> seen) {}
}
