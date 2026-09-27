package com.buildup.server.common;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

/** 날짜 계산은 모두 한국 시간 기준. */
public final class Times {

    public static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    private Times() {}

    public static LocalDate today() {
        return LocalDate.now(SEOUL);
    }

    public static boolean isToday(Instant instant) {
        return instant != null && instant.atZone(SEOUL).toLocalDate().equals(today());
    }

    /** 앱으로 보내는 날짜 문자열(ISO 8601, UTC). null이면 null. */
    public static String iso(Instant instant) {
        return instant == null ? null : instant.toString();
    }

    public static String ymd(LocalDate date) {
        return date == null ? null : date.toString();
    }

    public static LocalDate parseYmd(String ymd) {
        if (ymd == null || ymd.isBlank()) {
            return null;
        }
        try {
            return LocalDate.parse(ymd);
        } catch (Exception e) {
            throw ApiException.badRequest("날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)");
        }
    }
}
