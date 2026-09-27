package com.buildup.server.export;

import com.buildup.server.common.ApiException;
import com.buildup.server.common.Times;
import com.buildup.server.report.Report;
import com.buildup.server.report.ReportRepository;
import com.buildup.server.site.Site;
import com.buildup.server.site.SiteService;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 작업일보 엑셀 내보내기.
 * - 웹 대시보드: 로그인 토큰을 붙여 바로 받는다.
 * - 앱: 토큰을 브라우저에 넘길 수 없으므로, 10분짜리 임시 주소를 받아 브라우저로 연다.
 */
@Service
@RequiredArgsConstructor
public class ExportService {

    /** 한 번에 뽑을 수 있는 최대 기간 */
    static final int MAX_DAYS = 366;
    static final Duration LINK_VALID = Duration.ofMinutes(10);

    private final SiteService sites;
    private final ReportRepository reports;
    private final SecureRandom random = new SecureRandom();
    private final Map<String, Ticket> tickets = new ConcurrentHashMap<>();

    record Ticket(Long userId, Long siteId, LocalDate from, LocalDate to, Instant expiresAt) {}

    public record ExcelFile(String fileName, String asciiName, byte[] bytes) {}

    /** 기간을 정리한다: 비우면 최근 7일, 끝 날짜가 시작보다 앞이거나 너무 길면 거절 */
    static LocalDate[] period(String fromText, String toText) {
        LocalDate to = Times.parseYmd(toText);
        LocalDate from = Times.parseYmd(fromText);
        if (to == null) {
            to = Times.today();
        }
        if (from == null) {
            from = to.minusDays(6);
        }
        if (from.isAfter(to)) {
            throw ApiException.badRequest("시작 날짜가 끝 날짜보다 늦어요.");
        }
        if (ChronoUnit.DAYS.between(from, to) >= MAX_DAYS) {
            throw ApiException.badRequest("한 번에 최대 1년까지 내보낼 수 있어요.");
        }
        return new LocalDate[] {from, to};
    }

    @Transactional(readOnly = true)
    public ExcelFile workLog(Long userId, Long siteId, LocalDate from, LocalDate to) {
        Site site = sites.viewableSite(userId, siteId);
        Instant start = from.atStartOfDay(Times.SEOUL).toInstant();
        Instant end = to.plusDays(1).atStartOfDay(Times.SEOUL).toInstant();
        List<Report> rows = reports.findBySiteIdAndCreatedAtGreaterThanEqualAndCreatedAtLessThanOrderByCreatedAtAscIdAsc(
                siteId, start, end);
        byte[] bytes = WorkLogExcel.build(site, from, to, rows);
        String safeName = site.getName().replaceAll("[\\\\/:*?\"<>|\\s]+", "_");
        return new ExcelFile(
                safeName + "_작업일보_" + from + "_" + to + ".xlsx",
                "worklog_site" + siteId + "_" + from + "_" + to + ".xlsx",
                bytes);
    }

    /** 앱용 임시 주소 발급(볼 수 있는 현장인지 먼저 확인) */
    @Transactional(readOnly = true)
    public String issueTicket(Long userId, Long siteId, LocalDate from, LocalDate to) {
        sites.viewableSite(userId, siteId);
        Instant now = Instant.now();
        tickets.values().removeIf(t -> t.expiresAt().isBefore(now));
        if (tickets.size() > 5_000) {
            throw ApiException.badRequest("내보내기 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.");
        }
        byte[] raw = new byte[24];
        random.nextBytes(raw);
        String id = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        tickets.put(id, new Ticket(userId, siteId, from, to, now.plus(LINK_VALID)));
        return id;
    }

    /** 임시 주소로 받기(10분 안에는 여러 번 받아도 된다. 권한은 받을 때 다시 확인) */
    @Transactional(readOnly = true)
    public ExcelFile byTicket(String id) {
        Ticket t = id == null ? null : tickets.get(id);
        if (t == null || t.expiresAt().isBefore(Instant.now())) {
            if (t != null) {
                tickets.remove(id);
            }
            throw ApiException.notFound("내려받기 주소가 만료됐어요. 앱에서 다시 눌러 주세요.");
        }
        return workLog(t.userId(), t.siteId(), t.from(), t.to());
    }
}
