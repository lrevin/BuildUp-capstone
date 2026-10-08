package com.buildup.server.site;

import com.buildup.server.report.Report;
import com.buildup.server.report.ReportRepository;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 예전 방식(공정을 골라 공정별 진행률을 보고 → 비중으로 전체 진행률 계산) 데이터를
 * 새 방식(진행한 작업 + 현장 전체 진행률을 직접 입력)으로 한 번만 바꾼다.
 * - 보고마다 그 시점의 전체 진행률(보고 전 → 보고 후)을 계산해 넣는다 → 이력이 자연스럽게 이어진다
 * - 진행한 작업이 없던 예전 보고는 "공정 이름 + 작업"으로 채운다
 * - 현장 진행률 = 바꾸기 전 화면에 보이던 전체 진행률 그대로
 * 서버를 켤 때마다 확인하지만, 이미 바꾼 현장(progress가 있는 현장)은 건너뛴다.
 */
@Component
@Order(2) // 데모 데이터(DemoDataSeeder, 1번) 다음
@RequiredArgsConstructor
public class SiteProgressMigration implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(SiteProgressMigration.class);

    /** 데모 현장의 공사 종류(그 밖의 예전 현장은 '기타 공사') */
    private static final Map<String, String> DEMO_WORK_TYPES = Map.of(
            "482915", "건축 신축 공사",
            "731046", "증축 공사",
            "615203", "주택 리모델링 공사");

    private final SiteRepository sites;
    private final ReportRepository reports;

    @Override
    @Transactional
    public void run(String... args) {
        int n = 0;
        for (Site site : sites.findAll()) {
            if (site.getProgress() == null) {
                convert(site);
                n++;
            }
        }
        if (n > 0) {
            log.info("현장 {}곳의 진행률을 새 방식(현장 전체 진행률)으로 바꿨어요.", n);
        }
    }

    private void convert(Site site) {
        List<Report> rows = new ArrayList<>(reports.findBySiteIdOrderByCreatedAtDescIdDesc(site.getId()));
        java.util.Collections.reverse(rows); // 오래된 순

        Map<String, Double> weights = new HashMap<>();
        Map<String, Double> progress = new HashMap<>();
        for (SiteProcess p : site.getProcesses()) {
            weights.put(p.getKey(), p.getWeight());
            progress.put(p.getKey(), p.getProgress());
        }
        // 공정마다 첫 보고 전 진행률에서 시작
        for (Report r : rows) {
            if (weights.containsKey(r.getProcessKey()) && !startSet(rows, r)) {
                progress.put(r.getProcessKey(), r.getFromProgress());
            }
        }
        for (Report r : rows) {
            double before = weighted(weights, progress);
            if (weights.containsKey(r.getProcessKey())) {
                progress.put(r.getProcessKey(), r.getToProgress());
            }
            double after = Math.max(before, weighted(weights, progress));
            r.setFromProgress(before);
            r.setToProgress(after);
            if (r.getWork() == null || r.getWork().isBlank()) {
                r.setWork(r.getProcessName() + " 작업");
            }
        }
        site.setProgress(site.legacyProgress());
        site.setLastReportedAt(rows.isEmpty() ? null : rows.get(rows.size() - 1).getCreatedAt());
        if (site.getWorkType() == null || site.getWorkType().isBlank()) {
            site.setWorkType(DEMO_WORK_TYPES.getOrDefault(site.getCode(), "기타 공사"));
        }
    }

    /** 이 보고보다 앞선 같은 공정 보고가 있는가(첫 보고만 시작값으로 쓴다) */
    private static boolean startSet(List<Report> rows, Report r) {
        for (Report x : rows) {
            if (x == r) {
                return false;
            }
            if (x.getProcessKey().equals(r.getProcessKey())) {
                return true;
            }
        }
        return false;
    }

    private static double weighted(Map<String, Double> weights, Map<String, Double> progress) {
        double total = weights.values().stream().mapToDouble(Double::doubleValue).sum();
        if (total <= 0) {
            return 0;
        }
        double sum = 0;
        for (var e : weights.entrySet()) {
            sum += progress.getOrDefault(e.getKey(), 0.0) * e.getValue();
        }
        return Math.round(sum / total * 10) / 10.0;
    }
}
