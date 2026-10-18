package com.buildup.server.report;

import com.buildup.server.common.Times;
import com.buildup.server.site.Site;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

/** 보고 요청/응답 모양(앱 src/types.ts의 Report, WorkLog와 같음) */
public final class ReportDtos {

    private ReportDtos() {}

    /** 사진 촬영 시각이 제출보다 이만큼 앞서면 '오래된 사진' */
    static final Duration OLD_PHOTO = Duration.ofHours(24);
    /** 현장 위치에서 이만큼(m) 떨어지면 '현장 밖' */
    static final double FAR_METERS = 1000;

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

    /** 사진 1장과 촬영 정보(없으면 null) */
    public record PhotoDto(String url, String takenAt, Double latitude, Double longitude) {

        static PhotoDto of(ReportPhoto p) {
            return new PhotoDto(FileStorage.url(p.getFileName()), Times.iso(p.getTakenAt()), p.getLatitude(), p.getLongitude());
        }
    }

    /** 보고를 제출한 위치 */
    public record LocationDto(double latitude, double longitude, Double accuracy) {}

    /** 검토: pending(대기) | approved(승인) | revision(보완 요청) */
    public record ReviewDto(String status, String comment, String reviewer, String reviewedAt) {

        static ReviewDto of(Report r) {
            return new ReviewDto(
                    r.status(),
                    r.getReviewComment(),
                    r.getReviewer() == null ? null : r.getReviewer().getName(),
                    Times.iso(r.getReviewedAt()));
        }
    }

    /** 허위·지연 보고 확인 결과. type: old_photo | far_submit | far_photo | no_location */
    public record CheckDto(String type, String message) {}

    public record ReportDto(
            String id,
            String siteId,
            String siteName,
            String processKey,
            String processName,
            String work,
            double from,
            double to,
            Double processFrom,
            Double processTo,
            List<String> photoUris,
            List<PhotoDto> photos,
            List<FileDto> files,
            String memo,
            WorkLogDto workLog,
            String author,
            String authorId,
            String createdAt,
            String updatedAt,
            LocationDto location,
            ReviewDto review,
            List<CheckDto> checks,
            boolean canEdit,
            boolean canDelete,
            boolean canReview) {

        static ReportDto of(Report r, boolean canEdit, boolean canDelete, boolean canReview) {
            return new ReportDto(
                    String.valueOf(r.getId()),
                    String.valueOf(r.getSite().getId()),
                    r.getSite().getName(),
                    r.getProcessKey(),
                    r.getProcessName(),
                    r.workText(),
                    r.getFromProgress(),
                    r.getToProgress(),
                    r.getProcessFrom(),
                    r.getProcessTo(),
                    r.photoFiles().stream().map(FileStorage::url).toList(),
                    r.getPhotos().stream().map(PhotoDto::of).toList(),
                    r.getFiles().stream().map(FileDto::of).toList(),
                    r.getMemo(),
                    WorkLogDto.of(r),
                    r.getAuthor().getName(),
                    String.valueOf(r.getAuthor().getId()),
                    Times.iso(r.getCreatedAt()),
                    Times.iso(r.getUpdatedAt()),
                    r.getLatitude() == null ? null : new LocationDto(r.getLatitude(), r.getLongitude(), r.getAccuracy()),
                    ReviewDto.of(r),
                    findChecks(r),
                    canEdit,
                    canDelete,
                    canReview);
        }
    }

    /** 촬영 시각·위치로 의심스러운 점을 찾는다(막지는 않고 검토하는 사람에게 보여 준다) */
    static List<CheckDto> findChecks(Report r) {
        List<CheckDto> out = new ArrayList<>();
        // 1) 오래된 사진: 제출보다 하루 이상 먼저 찍은 사진
        long oldCount = 0;
        Duration oldest = Duration.ZERO;
        for (ReportPhoto p : r.getPhotos()) {
            if (p.getTakenAt() != null) {
                Duration age = Duration.between(p.getTakenAt(), r.getCreatedAt());
                if (age.compareTo(OLD_PHOTO) > 0) {
                    oldCount++;
                    oldest = age.compareTo(oldest) > 0 ? age : oldest;
                }
            }
        }
        if (oldCount > 0) {
            out.add(new CheckDto("old_photo",
                    "사진 " + oldCount + "장이 제출 " + ago(oldest) + " 전에 찍은 사진이에요"));
        }

        Site site = r.getSite();
        if (site.getLatitude() == null || site.getLongitude() == null) {
            return out; // 현장 위치를 저장하지 않았으면 위치 확인은 하지 않는다
        }
        // 2) 제출 위치가 현장과 먼지
        if (r.getLatitude() == null) {
            // 현장 위치를 저장하기 전에 올라온 보고(예전 보고)는 위치를 기록하지 않았으므로 알리지 않는다
            if (site.getLocationUpdatedAt() != null && r.getCreatedAt().isAfter(site.getLocationUpdatedAt())) {
                out.add(new CheckDto("no_location", "제출 위치 정보가 없어요"));
            }
        } else {
            double d = PhotoMeta.distance(site.getLatitude(), site.getLongitude(), r.getLatitude(), r.getLongitude());
            double slack = r.getAccuracy() == null ? 0 : Math.min(r.getAccuracy(), 500);
            if (d - slack > FAR_METERS) {
                out.add(new CheckDto("far_submit", "현장에서 약 " + km(d) + " 떨어진 곳에서 제출했어요"));
            }
        }
        // 3) 사진 촬영 위치가 현장과 먼지(사진에 GPS가 있을 때만)
        long far = r.getPhotos().stream()
                .filter(p -> p.getLatitude() != null)
                .filter(p -> PhotoMeta.distance(site.getLatitude(), site.getLongitude(), p.getLatitude(), p.getLongitude())
                        > FAR_METERS)
                .count();
        if (far > 0) {
            out.add(new CheckDto("far_photo", "사진 " + far + "장이 현장에서 1km 넘게 떨어진 곳에서 찍혔어요"));
        }
        return out;
    }

    private static String ago(Duration d) {
        long days = d.toDays();
        return days >= 1 ? days + "일" : d.toHours() + "시간";
    }

    private static String km(double meters) {
        return meters >= 10_000 ? Math.round(meters / 1000) + "km" : String.format("%.1fkm", meters / 1000);
    }

    public record MemoRequest(String memo) {}

    /** 검토 요청: { status: approved | revision, comment } (보완 요청은 코멘트 필수) */
    public record ReviewRequest(String status, String comment) {}

    /**
     * 나눠 불러온 보고 한 묶음.
     * nextCursor: 다음 묶음을 부를 때 그대로 넘기는 값(더 없으면 null)
     * total: 첫 묶음에만(보고 이력 화면의 '전체 40'). processes는 예전 앱 호환용(항상 빈 목록)
     */
    public record ReportPageDto(
            List<ReportDto> items, String nextCursor, Long total, List<ProcessCountDto> processes) {}

    public record ProcessCountDto(String key, String name, long count) {}

    /** 확인하지 않은 보고 수 요청: { seen: { 현장ID: 마지막으로 본 시각(ISO) 또는 null } } */
    public record UnreadRequest(java.util.Map<String, String> seen) {}
}
