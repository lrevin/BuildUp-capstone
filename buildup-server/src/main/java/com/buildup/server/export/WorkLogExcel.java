package com.buildup.server.export;

import com.buildup.server.common.Times;
import com.buildup.server.report.Report;
import com.buildup.server.site.Site;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import org.apache.poi.ss.usermodel.BorderStyle;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.HorizontalAlignment;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.VerticalAlignment;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

/**
 * 현장 작업일보 엑셀(.xlsx) 한 개를 만든다.
 * 시트 1 '작업일보': 기간 안의 보고 한 줄씩
 * 시트 2 '일자별 요약': 날짜마다 보고 수·진행한 작업·날씨·인원
 * 시트 3 '현장 개요': 공사 종류, 현재 진행률, 마지막 보고
 */
final class WorkLogExcel {

    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm");
    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
    private static final Map<String, String> REVIEW = Map.of("pending", "대기", "approved", "승인", "revision", "보완 요청");
    private static final Map<String, String> WEATHER = Map.of("sunny", "맑음", "cloudy", "흐림", "rain", "비", "snow", "눈");

    private final XSSFWorkbook wb = new XSSFWorkbook();
    private final CellStyle title;
    private final CellStyle sub;
    private final CellStyle head;
    private final CellStyle text;
    private final CellStyle wrap;
    private final CellStyle center;
    private final CellStyle percent;
    private final CellStyle number;
    private final CellStyle totalLabel;
    private final CellStyle totalPercent;

    private WorkLogExcel() {
        Font base = font(11, false, IndexedColors.BLACK);
        Font bold = font(11, true, IndexedColors.BLACK);
        title = wb.createCellStyle();
        title.setFont(font(16, true, IndexedColors.BLACK));
        sub = wb.createCellStyle();
        sub.setFont(font(10, false, IndexedColors.GREY_50_PERCENT));

        head = bordered();
        head.setFont(font(11, true, IndexedColors.WHITE));
        head.setFillForegroundColor(IndexedColors.DARK_BLUE.getIndex());
        head.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        head.setAlignment(HorizontalAlignment.CENTER);

        text = bordered();
        text.setFont(base);
        wrap = bordered();
        wrap.setFont(base);
        wrap.setWrapText(true);
        center = bordered();
        center.setFont(base);
        center.setAlignment(HorizontalAlignment.CENTER);
        percent = bordered();
        percent.setFont(base);
        percent.setDataFormat(wb.createDataFormat().getFormat("0.0\"%\""));
        number = bordered();
        number.setFont(base);
        number.setAlignment(HorizontalAlignment.CENTER);

        totalLabel = bordered();
        totalLabel.setFont(bold);
        totalLabel.setFillForegroundColor(IndexedColors.LEMON_CHIFFON.getIndex());
        totalLabel.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        totalPercent = bordered();
        totalPercent.cloneStyleFrom(totalLabel);
        totalPercent.setDataFormat(wb.createDataFormat().getFormat("0.0\"%\""));
    }

    static byte[] build(Site site, LocalDate from, LocalDate to, List<Report> reports) {
        WorkLogExcel x = new WorkLogExcel();
        String period = "기간: " + from + " ~ " + to + "   ·   출력: " + ZonedDateTime.now(Times.SEOUL).format(STAMP);
        x.reportsSheet(site, period, reports);
        x.dailySheet(site, period, reports);
        x.siteSheet(site, reports.size());
        return x.bytes();
    }

    private void reportsSheet(Site site, String period, List<Report> reports) {
        Sheet sh = wb.createSheet("작업일보");
        String[] cols = {"날짜", "시간", "진행한 작업", "이전 진행률", "보고 진행률", "증가", "날씨", "인원", "장비", "메모", "작성자", "사진", "첨부", "검토", "검토 코멘트"};
        int[] widths = {12, 7, 30, 11, 11, 9, 7, 7, 22, 46, 10, 6, 6, 9, 30};
        int r = header(sh, site.getName() + " 작업일보", period, cols, widths);
        if (reports.isEmpty()) {
            Row row = sh.createRow(r);
            cell(row, 0, "이 기간에는 보고가 없어요.", text);
            sh.addMergedRegion(new CellRangeAddress(r, r, 0, cols.length - 1));
            return;
        }
        int first = r;
        for (Report rep : reports) {
            ZonedDateTime at = rep.getCreatedAt().atZone(Times.SEOUL);
            Row row = sh.createRow(r++);
            cell(row, 0, at.toLocalDate().toString(), center);
            cell(row, 1, at.format(TIME), center);
            cell(row, 2, rep.workText(), wrap);
            num(row, 3, rep.getFromProgress(), percent);
            num(row, 4, rep.getToProgress(), percent);
            num(row, 5, rep.getToProgress() - rep.getFromProgress(), percent);
            cell(row, 6, weather(rep.getWeather()), center);
            if (rep.getWorkers() != null) {
                num(row, 7, rep.getWorkers(), number);
            } else {
                cell(row, 7, "", number);
            }
            cell(row, 8, rep.getEquipment(), wrap);
            cell(row, 9, rep.getMemo(), wrap);
            cell(row, 10, rep.getAuthor().getName(), center);
            num(row, 11, rep.getPhotos().size(), number);
            num(row, 12, rep.getFiles().size(), number);
            cell(row, 13, REVIEW.getOrDefault(rep.status(), ""), center);
            cell(row, 14, rep.getReviewComment(), wrap);
        }
        sh.setAutoFilter(new CellRangeAddress(first - 1, r - 1, 0, cols.length - 1));
    }

    private void dailySheet(Site site, String period, List<Report> reports) {
        Sheet sh = wb.createSheet("일자별 요약");
        String[] cols = {"날짜", "보고 수", "진행한 작업", "날씨", "인원(최대)", "진행률 증가 합계"};
        int[] widths = {12, 9, 50, 14, 11, 16};
        int r = header(sh, site.getName() + " 일자별 요약", period, cols, widths);

        Map<LocalDate, List<Report>> byDay = new TreeMap<>();
        for (Report rep : reports) {
            byDay.computeIfAbsent(rep.getCreatedAt().atZone(Times.SEOUL).toLocalDate(), d -> new java.util.ArrayList<>())
                    .add(rep);
        }
        if (byDay.isEmpty()) {
            Row row = sh.createRow(r);
            cell(row, 0, "이 기간에는 보고가 없어요.", text);
            sh.addMergedRegion(new CellRangeAddress(r, r, 0, cols.length - 1));
            return;
        }
        for (var e : byDay.entrySet()) {
            List<Report> day = e.getValue();
            Set<String> processes = new LinkedHashSet<>();
            Set<String> weathers = new LinkedHashSet<>();
            Integer maxWorkers = null;
            double gain = 0;
            for (Report rep : day) {
                processes.add(rep.workText());
                if (!weather(rep.getWeather()).isEmpty()) {
                    weathers.add(weather(rep.getWeather()));
                }
                if (rep.getWorkers() != null) {
                    maxWorkers = maxWorkers == null ? rep.getWorkers() : Math.max(maxWorkers, rep.getWorkers());
                }
                gain += rep.getToProgress() - rep.getFromProgress();
            }
            Row row = sh.createRow(r++);
            cell(row, 0, e.getKey().toString(), center);
            num(row, 1, day.size(), number);
            cell(row, 2, String.join(", ", processes), wrap);
            cell(row, 3, String.join(", ", weathers), center);
            if (maxWorkers != null) {
                num(row, 4, maxWorkers, number);
            } else {
                cell(row, 4, "", number);
            }
            num(row, 5, gain, percent);
        }
    }

    private void siteSheet(Site site, int reportCount) {
        Sheet sh = wb.createSheet("현장 개요");
        String[] cols = {"항목", "내용"};
        int[] widths = {18, 40};
        String now = "기준: " + ZonedDateTime.now(Times.SEOUL).format(STAMP);
        int r = header(sh, site.getName() + " 현장 개요", now, cols, widths);
        Object[][] rows = {
            {"현장명", site.getName()},
            {"주소", site.getAddress()},
            {"공사 종류", site.getWorkType() == null ? "" : site.getWorkType()},
            {"현장 관리자", site.getOwner().getName()},
            {"이 기간 보고 수", (double) reportCount},
            {"마지막 보고", stamp(site.getLastReportedAt())},
        };
        for (Object[] v : rows) {
            Row row = sh.createRow(r++);
            cell(row, 0, (String) v[0], text);
            if (v[1] instanceof Double d) {
                num(row, 1, d, number);
            } else {
                cell(row, 1, (String) v[1], text);
            }
        }
        Row total = sh.createRow(r);
        cell(total, 0, "현재 전체 진행률", totalLabel);
        num(total, 1, site.overallProgress(), totalPercent);
    }

    /** 제목·부제·머리행을 쓰고 다음 행 번호를 돌려준다 */
    private int header(Sheet sh, String titleText, String subText, String[] cols, int[] widths) {
        cell(sh.createRow(0), 0, titleText, title);
        cell(sh.createRow(1), 0, subText, sub);
        Row h = sh.createRow(3);
        for (int i = 0; i < cols.length; i++) {
            cell(h, i, cols[i], head);
            sh.setColumnWidth(i, widths[i] * 256 + 200);
        }
        sh.createFreezePane(0, 4);
        return 4;
    }

    /** 날씨 코드 → 한글(없으면 빈칸) */
    private static String weather(String code) {
        return code == null ? "" : WEATHER.getOrDefault(code, "");
    }

    private static String stamp(Instant at) {
        return at == null ? "" : at.atZone(Times.SEOUL).format(STAMP);
    }

    private static void cell(Row row, int col, String value, CellStyle style) {
        Cell c = row.createCell(col);
        c.setCellValue(value == null ? "" : value);
        c.setCellStyle(style);
    }

    private static void num(Row row, int col, double value, CellStyle style) {
        Cell c = row.createCell(col);
        c.setCellValue(Math.round(value * 10) / 10.0);
        c.setCellStyle(style);
    }

    private Font font(int size, boolean bold, IndexedColors color) {
        Font f = wb.createFont();
        f.setFontName("맑은 고딕");
        f.setFontHeightInPoints((short) size);
        f.setBold(bold);
        f.setColor(color.getIndex());
        return f;
    }

    private CellStyle bordered() {
        CellStyle s = wb.createCellStyle();
        s.setBorderTop(BorderStyle.THIN);
        s.setBorderBottom(BorderStyle.THIN);
        s.setBorderLeft(BorderStyle.THIN);
        s.setBorderRight(BorderStyle.THIN);
        s.setTopBorderColor(IndexedColors.GREY_40_PERCENT.getIndex());
        s.setBottomBorderColor(IndexedColors.GREY_40_PERCENT.getIndex());
        s.setLeftBorderColor(IndexedColors.GREY_40_PERCENT.getIndex());
        s.setRightBorderColor(IndexedColors.GREY_40_PERCENT.getIndex());
        s.setVerticalAlignment(VerticalAlignment.CENTER);
        return s;
    }

    private byte[] bytes() {
        try (wb; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            wb.write(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
