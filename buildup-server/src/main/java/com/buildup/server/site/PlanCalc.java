package com.buildup.server.site;

import com.buildup.server.common.Times;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * 공정 계획 계산(앱 src/utils/plan.ts와 같은 식).
 * 계획은 '시작일 0시에 0%, 완료일 다음날 0시에 100%'로 매일 같은 만큼 진행한다고 본다.
 */
public final class PlanCalc {

    private PlanCalc() {}

    /** 특정 시각의 계획 진행률(계획이 없으면 null) */
    public static Double plannedAt(LocalDate start, LocalDate end, Instant at) {
        if (start == null || end == null) {
            return null;
        }
        long s = start.atStartOfDay(Times.SEOUL).toInstant().toEpochMilli();
        long e = end.plusDays(1).atStartOfDay(Times.SEOUL).toInstant().toEpochMilli();
        double t = (double) (at.toEpochMilli() - s) / (e - s);
        double clamped = Math.min(1, Math.max(0, t));
        return Math.round(clamped * 1000) / 10.0;
    }

    /** 공정 비중을 반영한 전체 계획 진행률(공정이 있고 모든 공정에 계획이 있어야 계산) */
    public static Double overallPlanned(List<SiteProcess> processes, Instant at) {
        double sum = 0;
        double total = 0;
        for (SiteProcess p : processes) {
            Double v = plannedAt(p.getPlanStart(), p.getPlanEnd(), at);
            if (v == null) {
                return null;
            }
            sum += v * p.getWeight();
            total += p.getWeight();
        }
        if (total <= 0) {
            return null;
        }
        return Math.round(sum / total * 10) / 10.0;
    }
}
