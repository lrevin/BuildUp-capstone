package com.buildup.server.report;

import com.buildup.server.common.ApiException;
import com.buildup.server.push.Notices;
import com.buildup.server.report.ReportDtos.ReportDto;
import com.buildup.server.report.ReportDtos.ReportPageDto;
import com.buildup.server.report.ReportDtos.WorkLogDto;
import com.buildup.server.site.Site;
import com.buildup.server.site.SiteProcess;
import com.buildup.server.site.SiteService;
import com.buildup.server.user.User;
import com.buildup.server.user.UserRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/** 보고 제출(진행한 작업 + 현장 전체 진행률)·조회·검토·메모 수정·삭제 (권한 규칙은 앱 src/data/dummy.ts와 같다) */
@Service
@RequiredArgsConstructor
public class ReportService {

    public static final int MAX_PHOTOS = 10;
    /** 직접 입력 보고를 API에서 부르는 공정 이름 */
    public static final String WORK_KEY = Report.WORK_KEY;
    public static final int MAX_FILES = 5;
    private static final Set<String> WEATHERS = Set.of("sunny", "cloudy", "rain", "snow");

    private final ReportRepository reports;
    private final UserRepository users;
    private final SiteService sites;
    private final FileStorage files;
    private final Notices notices;

    /** 작성자는 수정 가능, (작성자 또는 현장 관리자) + 현장의 가장 최근 보고만 삭제 가능 */
    private ReportDto toDto(Report r, User viewer, boolean isLatest, Overall ov) {
        boolean isAuthor = r.getAuthor().getId().equals(viewer.getId());
        boolean canDelete = isLatest && (isAuthor || r.getSite().isOwner(viewer.getId()));
        return ReportDto.of(r, ov.of(r), isAuthor, canDelete, canReview(r, viewer));
    }

    private ReportDto toDto(Report r, User viewer, boolean isLatest) {
        return toDto(r, viewer, isLatest, new Overall());
    }

    /**
     * 보고 전·후 현장 전체 진행률.
     * 직접 입력 보고는 보고에 적힌 값 그대로, 자동 계산 현장의 공정 보고는 그 현장 보고를 처음부터 다시 따라가며
     * 공정 가중치로 계산한다(DB에는 공정 진행률만 저장되므로). 현장마다 한 번만 계산해서 기억한다.
     */
    final class Overall {
        private final Map<Long, Map<Long, double[]>> bySite = new java.util.HashMap<>();

        double[] of(Report r) {
            if (!r.isProcessReport()) {
                return new double[] {r.getFromProgress(), r.getToProgress()};
            }
            return bySite.computeIfAbsent(r.getSite().getId(), id -> replay(r.getSite()))
                    .getOrDefault(r.getId(), new double[] {0, 0});
        }
    }

    private Map<Long, double[]> replay(Site site) {
        List<Report> rows = new ArrayList<>(reports.findBySiteIdOrderByCreatedAtDescIdDesc(site.getId()));
        java.util.Collections.reverse(rows); // 오래된 순
        Map<String, Double> weights = new java.util.HashMap<>();
        Map<String, Double> state = new java.util.HashMap<>();
        for (SiteProcess p : site.getProcesses()) {
            weights.put(p.getKey(), p.getWeight());
            state.put(p.getKey(), p.getProgress());
        }
        // 각 공정은 그 공정의 첫 보고 전 값에서 시작
        java.util.Set<String> started = new java.util.HashSet<>();
        for (Report r : rows) {
            if (r.isProcessReport() && weights.containsKey(r.getProcessKey()) && started.add(r.getProcessKey())) {
                state.put(r.getProcessKey(), r.getFromProgress());
            }
        }
        Map<Long, double[]> out = new java.util.HashMap<>();
        for (Report r : rows) {
            if (!r.isProcessReport()) {
                out.put(r.getId(), new double[] {r.getFromProgress(), r.getToProgress()});
                continue;
            }
            double before = weighted(weights, state);
            if (weights.containsKey(r.getProcessKey())) {
                state.put(r.getProcessKey(), r.getToProgress());
            }
            out.put(r.getId(), new double[] {before, Math.max(before, weighted(weights, state))});
        }
        return out;
    }

    private static double weighted(Map<String, Double> weights, Map<String, Double> state) {
        double total = weights.values().stream().mapToDouble(Double::doubleValue).sum();
        if (total <= 0) {
            return 0;
        }
        double sum = 0;
        for (var e : weights.entrySet()) {
            sum += state.getOrDefault(e.getKey(), 0.0) * e.getValue();
        }
        return Math.round(sum / total * 10) / 10.0;
    }

    /**
     * 검토(승인·보완 요청)할 수 있는 사람: 연결된 본사의 관리자 또는 현장 총관리자. 본인이 쓴 보고는 못 한다.
     * (총관리자 본인 보고 → 본사 연결 현장이면 본사가 검토, 본사 없는 현장이면 제출할 때 바로 승인)
     */
    private static boolean canReview(Report r, User viewer) {
        if (!Report.PENDING.equals(r.status()) || r.getAuthor().getId().equals(viewer.getId())) {
            return false;
        }
        Site site = r.getSite();
        return site.isOwner(viewer.getId()) || site.isHqManagerOf(viewer);
    }

    private User viewer(Long userId) {
        return users.findById(userId).orElseThrow(() -> ApiException.unauthorized("로그인이 필요합니다."));
    }

    private boolean isLatest(Report r) {
        return reports.findFirstBySiteIdOrderByCreatedAtDescIdDesc(r.getSite().getId())
                .map(latest -> latest.getId().equals(r.getId()))
                .orElse(false);
    }

    @Transactional(readOnly = true)
    public List<ReportDto> list(Long userId, Long siteId) {
        sites.viewableSite(userId, siteId);
        User viewer = viewer(userId);
        List<Report> rows = reports.findBySiteIdOrderByCreatedAtDescIdDesc(siteId);
        // 목록이 최신순이라 처음 것이 현장의 가장 최근 보고
        Long latest = rows.isEmpty() ? null : rows.get(0).getId();
        Overall ov = new Overall();
        return rows.stream()
                .map(r -> toDto(r, viewer, r.getId().equals(latest), ov))
                .toList();
    }

    /** 본사 화면: 연결된 현장들의 최근 보고(본사는 검토만 가능) */
    @Transactional(readOnly = true)
    public List<ReportDto> recent(Long userId, List<Long> siteIds) {
        if (siteIds.isEmpty()) {
            return List.of();
        }
        User viewer = viewer(userId);
        Overall ov = new Overall();
        return reports.findTop100BySiteIdInOrderByCreatedAtDesc(siteIds).stream()
                .map(r -> ReportDto.of(r, ov.of(r), false, false, canReview(r, viewer)))
                .toList();
    }

    // ---- 나눠 불러오기 ----

    public static final int PAGE_MAX = 50;
    private static final Instant FAR_FUTURE = Instant.parse("9999-12-31T00:00:00Z");

    /** 현장 보고 이력 한 묶음(최신순). 첫 묶음에는 전체 보고 수도 담는다 */
    @Transactional(readOnly = true)
    public ReportPageDto page(Long userId, Long siteId, String cursor, int size) {
        sites.viewableSite(userId, siteId);
        User viewer = viewer(userId);
        int n = pageSize(size);
        List<Report> rows = fetchPage(List.of(siteId), null, cursor, n);
        String next = nextCursor(rows, n);
        if (rows.size() > n) {
            rows = rows.subList(0, n);
        }
        // 삭제 가능 여부: 현장의 가장 최근 보고인지
        Long latest = reports.findFirstBySiteIdOrderByCreatedAtDescIdDesc(siteId).map(Report::getId).orElse(null);
        Overall ov = new Overall();
        List<ReportDto> items = rows.stream()
                .map(r -> toDto(r, viewer, r.getId().equals(latest), ov))
                .toList();
        if (cursor != null && !cursor.isBlank()) {
            return new ReportPageDto(items, next, null, null);
        }
        return new ReportPageDto(items, next, reports.countBySiteId(siteId), List.of());
    }

    /** 본사: 연결된 여러 현장의 보고 한 묶음(본사는 검토만 가능) */
    @Transactional(readOnly = true)
    public ReportPageDto pageForSites(Long userId, List<Long> siteIds, String cursor, int size) {
        if (siteIds.isEmpty()) {
            return new ReportPageDto(List.of(), null, null, null);
        }
        int n = pageSize(size);
        List<Report> rows = fetchPage(siteIds, null, cursor, n);
        String next = nextCursor(rows, n);
        if (rows.size() > n) {
            rows = rows.subList(0, n);
        }
        User viewer = viewer(userId);
        Overall ov = new Overall();
        return new ReportPageDto(
                rows.stream().map(r -> ReportDto.of(r, ov.of(r), false, false, canReview(r, viewer))).toList(),
                next, null, null);
    }

    /** 현장별 확인하지 않은 보고 수(볼 수 없는 현장은 빼고 돌려준다) */
    @Transactional(readOnly = true)
    public Map<String, Long> unread(Long userId, Map<String, String> seen) {
        if (seen == null || seen.isEmpty()) {
            return Map.of();
        }
        if (seen.size() > 300) {
            throw ApiException.badRequest("현장이 너무 많아요.");
        }
        Map<String, Long> out = new LinkedHashMap<>();
        for (var e : seen.entrySet()) {
            Long siteId;
            try {
                siteId = Long.valueOf(e.getKey());
                sites.viewableSite(userId, siteId);
            } catch (NumberFormatException | ApiException ex) {
                continue;
            }
            Instant since = parseInstant(e.getValue());
            out.put(e.getKey(), since == null
                    ? reports.countBySiteId(siteId)
                    : reports.countBySiteIdAndCreatedAtAfter(siteId, since));
        }
        return out;
    }

    private static int pageSize(int size) {
        return Math.max(1, Math.min(size, PAGE_MAX));
    }

    /** 커서 모양: 보고시각(ISO) + "_" + 보고ID */
    private List<Report> fetchPage(List<Long> siteIds, String key, String cursor, int n) {
        Instant at = FAR_FUTURE;
        long id = Long.MAX_VALUE;
        if (cursor != null && !cursor.isBlank()) {
            int cut = cursor.lastIndexOf('_');
            try {
                at = Instant.parse(cursor.substring(0, cut));
                id = Long.parseLong(cursor.substring(cut + 1));
            } catch (RuntimeException e) {
                throw ApiException.badRequest("목록 위치 값이 올바르지 않습니다.");
            }
        }
        // 하나 더 불러와서 다음 묶음이 있는지 안다
        return reports.page(siteIds, key, at, id, Limit.of(n + 1));
    }

    private static String nextCursor(List<Report> rows, int n) {
        if (rows.size() <= n) {
            return null;
        }
        Report last = rows.get(n - 1);
        return last.getCreatedAt() + "_" + last.getId();
    }

    private static Instant parseInstant(String iso) {
        if (iso == null || iso.isBlank()) {
            return null;
        }
        try {
            return Instant.parse(iso);
        } catch (RuntimeException e) {
            return null;
        }
    }

    @Transactional
    public ReportDto create(
            Long userId,
            Long siteId,
            String work,
            Double to,
            String processKey,
            Double processTo,
            String memo,
            WorkLogDto workLog,
            List<MultipartFile> photos,
            List<MultipartFile> documents,
            SubmitPlace place,
            List<String> photoTakenAt) {
        Site site = sites.memberSite(userId, siteId);
        String workText = work == null ? "" : work.trim();
        if (workText.length() > 100) {
            throw ApiException.badRequest("진행한 작업은 100자까지 쓸 수 있어요.");
        }
        double current = site.overallProgress();
        SiteProcess process = null;
        if (site.isAuto()) {
            // 자동 계산: 공정 하나의 진행률을 올리면 현장 전체 진행률은 가중치로 계산
            process = site.getProcesses().stream()
                    .filter(p -> p.getKey().equals(processKey))
                    .findFirst()
                    .orElseThrow(() -> ApiException.badRequest("보고할 공정을 골라 주세요."));
            if (processTo == null || !Double.isFinite(processTo) || processTo < process.getProgress() || processTo > 100) {
                throw ApiException.badRequest("'" + process.getName() + "' 진행률은 지금 값(" + process.getProgress()
                        + "%) 이상, 100% 이하여야 해요.");
            }
            if (workText.isEmpty()) {
                workText = process.getName() + " 작업";
            }
        } else {
            if (workText.isEmpty()) {
                throw ApiException.badRequest("진행한 작업을 입력해 주세요.");
            }
            if (to == null || !Double.isFinite(to) || to < current || to > 100) {
                throw ApiException.badRequest("진행률은 지금 진행률(" + current + "%) 이상, 100% 이하여야 해요.");
            }
        }
        List<MultipartFile> uploads = photos == null
                ? List.of()
                : photos.stream().filter(f -> !f.isEmpty()).toList();
        if (uploads.size() > MAX_PHOTOS) {
            throw ApiException.badRequest("사진은 최대 " + MAX_PHOTOS + "장까지 올릴 수 있어요.");
        }
        List<MultipartFile> docs = documents == null
                ? List.of()
                : documents.stream().filter(f -> !f.isEmpty()).toList();
        if (docs.size() > MAX_FILES) {
            throw ApiException.badRequest("파일은 최대 " + MAX_FILES + "개까지 첨부할 수 있어요.");
        }
        // 형식이 틀린 파일이 있으면 아무것도 저장하기 전에 거절(사진만 남는 일 방지)
        docs.forEach(FileStorage::checkDocument);
        SubmitPlace at = place == null ? SubmitPlace.NONE : place.checked();
        WorkLogDto log = workLog == null ? WorkLogDto.EMPTY : workLog;
        if (log.weather() != null && !WEATHERS.contains(log.weather())) {
            throw ApiException.badRequest("날씨 값이 올바르지 않습니다.");
        }

        User author = viewer(userId);
        Instant now = Instant.now();
        Report r = new Report();
        r.setSite(site);
        r.setWork(workText);
        if (process != null) {
            // 자동 계산: 보고에는 공정 진행률(보고 전 → 후)을 저장한다
            double pTo = Math.round(processTo * 10) / 10.0;
            r.setProcessKey(process.getKey());
            r.setProcessName(process.getName());
            r.setFromProgress(process.getProgress());
            r.setToProgress(pTo);
            process.setProgress(pTo);
            process.setLastReportedAt(now);
        } else {
            // 직접 입력: 현장 전체 진행률(보고 전 → 후)
            r.setFromProgress(current);
            r.setToProgress(Math.round(to * 10) / 10.0);
        }
        r.setMemo(memo == null ? "" : memo.trim());
        r.setWeather(log.weather());
        r.setWorkers(log.workers() != null && log.workers() > 0 ? log.workers() : null);
        r.setEquipment(log.equipment() == null ? "" : log.equipment().trim());
        r.setAuthor(author);
        r.setCreatedAt(now);
        r.setUpdatedAt(now);
        r.setLatitude(at.latitude());
        r.setLongitude(at.longitude());
        r.setAccuracy(at.accuracy());
        // 본사 없는 현장의 총관리자(최고 책임자)가 올린 보고는 검토할 사람이 없으므로 바로 승인
        r.setReviewStatus(site.isOwner(userId) && site.getCompany() == null ? Report.APPROVED : Report.PENDING);
        // 사진 촬영 정보: 사진 파일의 EXIF가 있으면 그것을, 없으면 앱이 알려 준 촬영 시각
        for (int i = 0; i < uploads.size(); i++) {
            MultipartFile f = uploads.get(i);
            PhotoMeta.Info meta = PhotoMeta.read(f);
            java.time.Instant taken = meta.takenAt() != null
                    ? meta.takenAt()
                    : PhotoMeta.parse(photoTakenAt != null && i < photoTakenAt.size() ? photoTakenAt.get(i) : null);
            String original = f.getOriginalFilename() == null || f.getOriginalFilename().isBlank()
                    ? "photo_" + i + ".jpg" : f.getOriginalFilename();
            r.addPhoto(new ReportPhoto(files.save(f), original, f.getContentType(), f.getSize(),
                    taken, meta.latitude(), meta.longitude()));
        }
        docs.forEach(d -> r.addFile(files.saveDocument(d)));
        // 촬영 시각·위치 확인 결과를 제출할 때 저장(report_checks)
        ReportDtos.findChecks(r).forEach(c -> r.addCheck(c.type(), c.message()));
        reports.save(r);
        notices.reportCreated(r);
        // 응답의 전체 진행률: 직접 입력은 보고 값, 자동 계산은 공정을 바꾼 뒤 계산값
        double[] overall = process != null
                ? new double[] {current, Math.max(current, site.weightedProgress())}
                : new double[] {r.getFromProgress(), r.getToProgress()};
        return ReportDto.of(r, overall, true, true, canReview(r, author));
    }

    @Transactional
    public ReportDto updateMemo(Long userId, Long reportId, String memo) {
        Report r = find(userId, reportId);
        if (!r.getAuthor().getId().equals(userId)) {
            throw ApiException.forbidden("작성자만 수정할 수 있습니다.");
        }
        r.setMemo(memo == null ? "" : memo.trim());
        r.setUpdatedAt(Instant.now());
        if (Report.REVISION.equals(r.status())) {
            // 보완해서 다시 올림 → 검토 대기로 돌리고 검토한 사람에게 알림
            r.setReviewStatus(Report.PENDING);
            notices.reportResubmitted(r);
        }
        return toDto(r, r.getAuthor(), isLatest(r));
    }

    /** 본사 관계자·현장 총관리자: 승인 / 보완 요청(코멘트 필수) */
    @Transactional
    public ReportDto review(Long userId, Long reportId, String status, String comment) {
        Report r = reports.findById(reportId).orElseThrow(() -> ApiException.notFound("보고를 찾을 수 없습니다."));
        sites.viewableSite(userId, r.getSite().getId());
        User viewer = viewer(userId);
        String next = status == null ? "" : status;
        if (!Report.APPROVED.equals(next) && !Report.REVISION.equals(next)) {
            throw ApiException.badRequest("검토 값이 올바르지 않습니다.");
        }
        String text = comment == null ? "" : comment.trim();
        if (Report.REVISION.equals(next) && text.isEmpty()) {
            throw ApiException.badRequest("무엇을 보완해야 하는지 코멘트를 적어 주세요.");
        }
        if (text.length() > 500) {
            throw ApiException.badRequest("코멘트는 500자까지 쓸 수 있어요.");
        }
        if (!canReview(r, viewer)) {
            if (r.getAuthor().getId().equals(userId)) {
                throw ApiException.forbidden("본인이 올린 보고는 검토할 수 없어요.");
            }
            if (!Report.PENDING.equals(r.status())) {
                throw ApiException.conflict("이미 검토한 보고예요. 목록을 새로고침해 주세요.");
            }
            throw ApiException.forbidden("현장 관리자나 본사 관계자만 검토할 수 있어요.");
        }
        r.addReview(viewer, next, text.isEmpty() ? null : text, Instant.now());
        notices.reportReviewed(r);
        return toDto(r, viewer, isLatest(r));
    }

    /** 가장 최근 보고만 삭제 가능 → 공정 진행률을 보고 전 값으로 되돌린다 */
    @Transactional
    public void delete(Long userId, Long reportId) {
        Report r = find(userId, reportId);
        if (!toDto(r, viewer(userId), isLatest(r)).canDelete()) {
            throw ApiException.forbidden("현장의 가장 최근 보고만, 작성자나 현장 관리자가 삭제할 수 있습니다.");
        }
        Site site = r.getSite();
        String key = r.getProcessKey();
        Double processFrom = r.isProcessReport() ? r.getFromProgress() : null;
        files.deleteAfterCommit(r.photoFiles(), r.getFiles());
        reports.delete(r);
        reports.flush();

        // 자동 계산 현장은 보고한 공정의 진행률을 보고 전 값으로 되돌린다
        // (직접 입력 현장의 전체 진행률은 '가장 최근 보고' 값이라 따로 되돌릴 것이 없다)
        if (processFrom != null) {
            site.getProcesses().stream().filter(p -> p.getKey().equals(key)).findFirst().ifPresent(p -> {
                p.setProgress(processFrom);
                p.setLastReportedAt(reports.findBySiteIdOrderByCreatedAtDescIdDesc(site.getId()).stream()
                        .filter(x -> key.equals(x.getProcessKey()))
                        .map(Report::getCreatedAt)
                        .findFirst()
                        .orElse(null));
            });
        }
    }

    /** 보고를 제출한 위치(휴대폰 GPS). 없으면 NONE */
    public record SubmitPlace(Double latitude, Double longitude, Double accuracy) {
        public static final SubmitPlace NONE = new SubmitPlace(null, null, null);

        SubmitPlace checked() {
            if (latitude == null || longitude == null) {
                return NONE;
            }
            if (!Double.isFinite(latitude) || !Double.isFinite(longitude)
                    || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
                throw ApiException.badRequest("위치 값이 올바르지 않습니다.");
            }
            Double acc = accuracy == null || !Double.isFinite(accuracy) || accuracy < 0 ? null : accuracy;
            return new SubmitPlace(latitude, longitude, acc);
        }
    }

    private Report find(Long userId, Long reportId) {
        Report r = reports.findById(reportId).orElseThrow(() -> ApiException.notFound("보고를 찾을 수 없습니다."));
        sites.memberSite(userId, r.getSite().getId());
        return r;
    }
}
