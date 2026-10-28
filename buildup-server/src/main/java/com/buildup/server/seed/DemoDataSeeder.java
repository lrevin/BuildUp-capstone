package com.buildup.server.seed;

import com.buildup.server.common.Times;
import com.buildup.server.hq.Company;
import com.buildup.server.hq.CompanyRepository;
import com.buildup.server.material.MaterialItem;
import com.buildup.server.material.MaterialRequest;
import com.buildup.server.material.MaterialRequestRepository;
import com.buildup.server.report.Report;
import com.buildup.server.report.ReportRepository;
import com.buildup.server.site.Site;
import com.buildup.server.site.SiteMember;
import com.buildup.server.site.SiteProcess;
import com.buildup.server.site.SiteRepository;
import com.buildup.server.user.Role;
import com.buildup.server.user.User;
import com.buildup.server.user.UserRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * DB가 비어 있으면 데모 데이터를 넣는다(앱 src/data/dummy.ts의 makeSeed와 같은 내용).
 *
 * 테스트 계정(비밀번호 모두 1234)
 *   본사 관계자 hq@buildup.kr → 한빛건설 본사(본사 코드 250901), 한빛·세종 현장 연결됨
 *   현장 관리자(본사 보고) admin@buildup.kr → 한빛(코드 482915)·세종(코드 731046) 운영, 한빛건설 본사에 보고
 *   현장 관리자(최고 책임자) park@buildup.kr → 박철근 인력사무소, 원주 단독주택(코드 615203) 운영,
 *                                            한빛 현장에는 작업자로 참여
 *   작업자 worker@buildup.kr → 한빛·원주 단독주택 참여 / choi@ 도 한빛 참여 중
 */
@Component
@org.springframework.core.annotation.Order(1) // 다음에 SiteProgressMigration(2번)이 새 방식으로 바꾼다
@RequiredArgsConstructor
public class DemoDataSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(DemoDataSeeder.class);

    /** 데모 보고 이력을 만들 때 쓰는 공정: [키, 이름, 비중] (만든 뒤 SiteProgressMigration이 현장 전체 진행률로 바꾼다) */
    private static final List<Object[]> DEMO_PROCESSES = List.of(
            new Object[] {"frame", "골조", 0.4},
            new Object[] {"electric", "전기", 0.2},
            new Object[] {"plumbing", "설비", 0.2},
            new Object[] {"finish", "마감", 0.2});

    private static final double[] STEPS = {1.5, 1.0, 2.0, 1.5, 0.5, 2.5, 1.0, 1.5, 2.0, 1.0, 1.5, 0.5, 2.0, 1.5, 1.0};
    private static final String[] WEATHERS = {"sunny", "sunny", "cloudy", "sunny", "rain", "cloudy", "sunny"};

    private final UserRepository users;
    private final SiteRepository sites;
    private final ReportRepository reports;
    private final MaterialRequestRepository materials;
    private final CompanyRepository companies;
    private final PasswordEncoder passwordEncoder;

    @Value("${buildup.seed-demo:true}")
    private boolean enabled;

    @Override
    @Transactional
    public void run(String... args) {
        if (!enabled) {
            return;
        }
        if (users.count() == 0) {
            seedAll();
        }
        if (users.findByEmail("sys@buildup.kr").isEmpty()) {
            log.info("시스템 관리자 데모 계정을 추가합니다.");
            user("시스템 관리자", "sys@buildup.kr", "010-0000-0000", Role.SYSTEM);
        }
        seedDemoInterior();
    }

    /**
     * 개발·시연용 인테리어 현장. 참여 코드는 000000으로 고정(재발급 불가)이고, 지워져도 서버를 켜면 다시 생긴다.
     * 관리자 이영호(admin@), 작업자 김철수(worker@)가 처음부터 참여. 진행률 0%에서 시작
     */
    private void seedDemoInterior() {
        if (sites.findByCode(Site.DEMO_CODE).isPresent()) {
            return;
        }
        User admin = users.findByEmail("admin@buildup.kr").orElse(null);
        if (admin == null) {
            return;
        }
        log.info("데모 인테리어 현장(코드 000000)을 만듭니다.");
        Site s = new Site();
        s.setName("데모 인테리어 현장 (아파트 리모델링)");
        s.setAddress("강원 원주시 단계동 데모아파트 101동 1203호");
        s.setOwner(admin);
        s.setCode(Site.DEMO_CODE);
        s.setWorkType("아파트 리모델링");
        s.setProgressMode(Site.MODE_MANUAL);
        s.setCompany(sites.findFirstByOwnerIdAndCompanyIsNotNullOrderByCreatedAtDescIdDesc(admin.getId())
                .map(Site::getCompany)
                .orElse(null));
        Instant now = Instant.now();
        s.getMembers().add(new SiteMember(s, admin, now));
        users.findByEmail("worker@buildup.kr").ifPresent(w -> s.getMembers().add(new SiteMember(s, w, now)));
        sites.save(s);
    }

    private void seedAll() {
        log.info("데모 데이터를 넣습니다.");

        // 본사
        Company hq = new Company();
        hq.setName("한빛건설 본사");
        hq.setCode("250901");
        companies.save(hq);

        // 본사 관리자(HQ_MANAGER): 본사를 등록한 사람
        User jung = user("정본사", "hq@buildup.kr", "010-7777-8888", Role.WORKER);
        jung.joinCompany(hq, true);
        // 본사에 보고하는 현장 관리자(내 현장이 한빛건설 본사에 연결됨)
        User admin = user("이영호", "admin@buildup.kr", "010-1234-5678", Role.ADMIN);
        User kim = user("김현장", "worker@buildup.kr", "010-9876-5432", Role.WORKER);
        // 최고 책임자(본사 없음): 본인 현장을 운영하면서 한빛 현장에는 작업자로 참여
        User park = user("박철근", "park@buildup.kr", "010-2222-3333", Role.ADMIN);
        User choi = user("최전기", "choi@buildup.kr", "010-4444-5555", Role.WORKER);

        // 한빛: 골조·전기 지연, 설비 앞섬, 마감 정상 → 전체 '지연'
        Site hanbit = site("한빛 오피스텔 신축공사", "강원 원주시 무실동 123-4", admin, "482915", "건축 신축 공사",
                new double[] {68.5, 35.0, 28.5, 15.5},
                new int[][] {{-60, 20}, {-40, 60}, {-30, 90}, {-20, 100}});
        hanbit.getMembers().add(new SiteMember(hanbit, admin, at(60, 9)));
        hanbit.getMembers().add(new SiteMember(hanbit, kim, at(45, 8)));
        hanbit.getMembers().add(new SiteMember(hanbit, park, at(40, 8)));
        hanbit.getMembers().add(new SiteMember(hanbit, choi, at(35, 8)));
        hanbit.setCompany(hq);
        sites.save(hanbit);

        // 세종: 대부분 앞섬, 관리자만 참여(작업자는 코드 731046으로 참여 테스트)
        Site sejong = site("세종 물류센터 증축공사", "세종시 연서면 산단로 56", admin, "731046", "증축 공사",
                new double[] {92.0, 60.5, 55.0, 30.0},
                new int[][] {{-120, 10}, {-60, 60}, {-60, 60}, {-30, 90}});
        sejong.getMembers().add(new SiteMember(sejong, admin, at(120, 9)));
        sejong.setCompany(hq);
        sites.save(sejong);

        // 한빛 보고 이력(약 한 달치)
        history(hanbit, "frame", 68.5, 1, 2, 15, List.of(kim, park), List.of(
                "8층 슬래브 타설 완료. 우천 대비 양생포 설치.",
                "7층 벽체 거푸집 해체, 8층 철근 배근 시작.",
                "7층 슬래브 타설.",
                "6층 기둥 철근 검측 완료."));
        history(hanbit, "electric", 35.0, 1, 3, 10, List.of(kim, choi), List.of(
                "5~6층 배관 입선 작업.", "3~4층 분전반 설치 완료."));
        history(hanbit, "plumbing", 28.5, 2, 4, 7, List.of(kim, park), List.of("", "지하 1층 급수 배관 설치."));
        history(hanbit, "finish", 15.5, 3, 5, 6, List.of(admin, kim), List.of(
                "2층 내벽 석고보드 시공.", "1층 방수 1차 완료."));

        // 세종 보고 이력(관리자 보고)
        history(sejong, "frame", 92.0, 1, 3, 5, List.of(admin), List.of(
                "증축동 지붕 트러스 설치 완료.", "3층 데크플레이트 타설."));
        history(sejong, "electric", 60.5, 2, 4, 4, List.of(admin), List.of("수배전반 반입·설치."));

        seedMaterials(hanbit, sejong, jung, admin, kim, park, choi);
        seedIndependent(park, kim);
    }

    /** 최고 책임자(본사 없음)의 작은 현장: 공정도 현장에 맞게 직접 만든 예시 */
    private void seedIndependent(User park, User kim) {
        Site s = new Site();
        s.setName("원주 단독주택 리모델링");
        s.setAddress("강원 원주시 단구동 45-2");
        s.setOwner(park);
        s.setCode("615203");
        s.setWorkType("주택 리모델링 공사");
        s.setProgressMode(Site.MODE_AUTO);
        String[][] procs = {{"demolish", "철거"}, {"piping", "설비 교체"}, {"interior", "내장 마감"}};
        double[] weights = {20, 30, 50};
        double[] progress = {100, 55, 10};
        int[][] plans = {{-20, -10}, {-12, 8}, {0, 25}};
        LocalDate today = Times.today();
        for (int i = 0; i < procs.length; i++) {
            SiteProcess p = new SiteProcess(s, procs[i][0], procs[i][1], weights[i], i);
            p.setProgress(progress[i]);
            p.setPlanStart(today.plusDays(plans[i][0]));
            p.setPlanEnd(today.plusDays(plans[i][1]));
            s.getProcesses().add(p);
        }
        s.getMembers().add(new SiteMember(s, park, at(25, 8)));
        if (kim != null) {
            s.getMembers().add(new SiteMember(s, kim, at(20, 8)));
        }
        sites.save(s);
        List<User> authors = kim != null ? List.of(kim, park) : List.of(park);
        history(s, "demolish", 100, 9, 2, 5, authors, List.of("철거 완료, 폐기물 반출."));
        history(s, "piping", 55, 1, 2, 5, authors, List.of("욕실 급배수 배관 교체.", "주방 배관 교체."));
        history(s, "interior", 10, 0, 1, 1, List.of(park), List.of("거실 벽지 제거 시작."));
    }

    /** 자재 요청 예시: 승인 대기·승인·반려가 골고루 보이도록(앱 dummy.ts의 seedMaterials와 같은 내용) */
    private void seedMaterials(Site hanbit, Site sejong, User jung, User admin, User kim, User park, User choi) {
        LocalDate today = Times.today();
        String R = MaterialRequest.REQUESTED;
        String A = MaterialRequest.APPROVED;
        String X = MaterialRequest.REJECTED;
        materials.saveAll(List.of(
                // 승인 대기(작업자 요청 → 총관리자나 본사가 처리)
                material(hanbit, "electric", choi, today.plusDays(1), true, "5층 입선 작업분이 모자라요.", null,
                        List.of(item("전선 HFIX 2.5sq", 10, "롤"), item("CD관 22mm", 30, "본")),
                        step(R, choi, false, 0, 8)),
                material(hanbit, "frame", kim, today.plusDays(2), false, "9층 슬래브 배근용", null,
                        List.of(item("철근 HD13", 5, "톤"), item("결속선", 10, "롤")),
                        step(R, kim, false, 0, 7)),
                // 승인 대기(총관리자 본인 요청 → 본사가 처리)
                material(hanbit, "frame", admin, today.plusDays(1), true, "10층 거푸집 전용. 오전 반입 부탁드립니다.", null,
                        List.of(item("유로폼 600×1200", 200, "장"), item("각재 50×50", 150, "본")),
                        step(R, admin, false, 0, 9)),
                material(sejong, "frame", admin, today.plusDays(5), false, "증축동 2차 철골", null,
                        List.of(item("H형강 300×300", 12, "톤")),
                        step(R, admin, false, 1, 10)),
                // 승인
                material(hanbit, "plumbing", park, today.plusDays(3), false, "", null,
                        List.of(item("PVC관 100mm", 20, "본")),
                        step(R, park, false, 1, 15), step(A, admin, false, 1, 17)),
                material(hanbit, "finish", kim, today.plusDays(2), false, "3층 내벽용", null,
                        List.of(item("석고보드 9.5T", 120, "장")),
                        step(R, kim, false, 3, 10), step(A, jung, true, 2, 11)),
                // 반려
                material(hanbit, "finish", park, null, false, "2층 내벽용", "이미 요청된 자재예요",
                        List.of(item("석고보드 9.5T", 100, "장")),
                        step(R, park, false, 3, 9), step(X, admin, false, 3, 12))));
    }

    private record Step(String status, User actor, boolean byHq, int daysAgo, int hour) {}

    private static Step step(String status, User actor, boolean byHq, int daysAgo, int hour) {
        return new Step(status, actor, byHq, daysAgo, hour);
    }

    private static MaterialItem item(String name, double quantity, String unit) {
        return new MaterialItem(name, quantity, unit);
    }

    private MaterialRequest material(Site site, String key, User author, LocalDate neededBy, boolean urgent,
            String note, String rejectReason, List<MaterialItem> items, Step... steps) {
        MaterialRequest m = new MaterialRequest();
        m.setSite(site);
        site.getProcesses().stream().filter(p -> p.getKey().equals(key)).findFirst().ifPresent(p -> {
            m.setProcessKey(p.getKey());
            m.setProcessName(p.getName());
        });
        m.setItems(new ArrayList<>(items));
        m.setNeededBy(neededBy);
        m.setUrgent(urgent);
        m.setNote(note);
        m.setRejectReason(rejectReason);
        m.setAuthor(author);
        for (Step s : steps) {
            m.addEvent(s.status(), s.actor(), s.byHq(), at(s.daysAgo(), s.hour()));
        }
        m.setCreatedAt(at(steps[0].daysAgo(), steps[0].hour()));
        m.setStatus(steps[steps.length - 1].status());
        return m;
    }

    private User user(String name, String email, String phone, Role role) {
        User u = new User();
        u.setName(name);
        u.setEmail(email);
        u.setPhone(phone);
        u.setRole(role);
        u.setPasswordHash(passwordEncoder.encode("1234"));
        return users.save(u);
    }

    private Site site(String name, String address, User owner, String code, String workType,
            double[] progress, int[][] plans) {
        Site s = new Site();
        s.setName(name);
        s.setAddress(address);
        s.setWorkType(workType);
        s.setOwner(owner);
        s.setCode(code);
        s.setProgressMode(Site.MODE_AUTO);
        for (int i = 0; i < DEMO_PROCESSES.size(); i++) {
            Object[] d = DEMO_PROCESSES.get(i);
            s.getProcesses().add(new SiteProcess(s, (String) d[0], (String) d[1], (double) d[2], i));
        }
        LocalDate today = Times.today();
        for (int i = 0; i < s.getProcesses().size(); i++) {
            SiteProcess p = s.getProcesses().get(i);
            p.setProgress(progress[i]);
            p.setPlanStart(today.plusDays(plans[i][0]));
            p.setPlanEnd(today.plusDays(plans[i][1]));
        }
        return s;
    }

    /** 최근 보고부터 거꾸로 만들어 현재 진행률과 이어지게 한다 */
    private void history(Site site, String key, double finalProgress, int lastDaysAgo, int every, int count,
            List<User> authors, List<String> memos) {
        SiteProcess process = site.getProcesses().stream().filter(p -> p.getKey().equals(key)).findFirst().orElseThrow();
        process.setLastReportedAt(at(lastDaysAgo, 16));
        List<Report> rows = new ArrayList<>();
        double to = finalProgress;
        for (int i = 0; i < count; i++) {
            double inc = STEPS[(i + key.length()) % STEPS.length];
            double from = Math.round((to - inc) * 10) / 10.0;
            Report r = new Report();
            r.setSite(site);
            r.setProcessKey(key);
            r.setProcessName(process.getName());
            r.setWork(process.getName() + " 작업");
            r.setFromProgress(from);
            r.setToProgress(to);
            r.setMemo(i < memos.size() ? memos.get(i) : "");
            r.setWeather(WEATHERS[(i + every) % WEATHERS.length]);
            r.setWorkers(4 + ((i * 3 + key.length()) % 9));
            r.setEquipment("frame".equals(key) && i % 2 == 0 ? "타워크레인 1, 펌프카 1" : "");
            r.setAuthor(authors.get(i % authors.size()));
            r.setCreatedAt(at(lastDaysAgo + i * every, 16 + (i % 2)));
            r.setUpdatedAt(r.getCreatedAt());
            // 공정별 가장 최근 보고(현장 총관리자가 아닌 사람이 쓴 것)만 검토 대기, 나머지는 승인된 것으로
            boolean ownerWrote = r.getAuthor().getId() != null && r.getAuthor().getId().equals(site.getOwner().getId());
            r.setReviewStatus(i == 0 && !ownerWrote ? Report.PENDING : Report.APPROVED);
            rows.add(r);
            to = from;
        }
        // 검토 대기 보고는 진행률에 아직 반영하지 않는다(승인돼야 오른다)
        if (!rows.isEmpty() && !rows.get(0).isApproved()) {
            process.setProgress(rows.get(0).getFromProgress());
        }
        reports.saveAll(rows);
    }

    /** n일 전 hour시(한국 시간) */
    private static Instant at(int daysAgo, int hour) {
        return Times.today().minusDays(daysAgo).atTime(hour, 0).atZone(Times.SEOUL).toInstant();
    }
}
