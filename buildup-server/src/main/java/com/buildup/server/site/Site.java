package com.buildup.server.site;

import com.buildup.server.hq.Company;
import com.buildup.server.user.User;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.Formula;

/**
 * 작업 현장 (DB 설계 V11 `sites`)
 * 현장 전체 진행률은 DB에 따로 저장하지 않고 계산한다.
 * - 자동 계산(PROCESS_WEIGHTED): 공정 진행률 × 가중치
 * - 직접 입력(MANUAL_INPUT): 가장 최근 보고의 '보고 후 진행률'
 */
@Entity
@Table(name = "sites")
@Getter
@Setter
@NoArgsConstructor
public class Site {

    /** 개발·시연용 데모 인테리어 현장의 고정 참여 코드(재발급 불가, 새 현장에는 발급 안 함) */
    public static final String DEMO_CODE = "000000";

    /** 진행률 계산 방식(API 값): 직접 입력 / 자동 계산(공정 가중치) */
    public static final String MODE_MANUAL = "manual";
    public static final String MODE_AUTO = "auto";
    /** DB 값 */
    static final String DB_WEIGHTED = "PROCESS_WEIGHTED";
    static final String DB_MANUAL = "MANUAL_INPUT";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false, length = 255)
    private String address;

    /** 공사 종류(예: 실내건축 공사, 상·하수도 설비 공사, 직접 입력한 이름) */
    @Column(name = "work_type", length = 100)
    private String workType;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "owner_id")
    private User owner;

    /** 6자리 참여 코드(현장끼리 겹치지 않음) */
    @Column(nullable = false, unique = true, length = 50)
    private String code;

    @Column(nullable = false, columnDefinition = "datetime(6)")
    private Instant createdAt = Instant.now();

    /** 연결된 본사(없으면 본사 보고 없이 현장 안에서만 운영) */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id")
    private Company company;

    /** 현장 위치(현장 관리자가 현장에서 '현재 위치로 저장'). 보고 위치 확인에 쓴다. 없으면 확인 안 함 */
    @Column(columnDefinition = "decimal(10,7)")
    private Double latitude;

    @Column(columnDefinition = "decimal(10,7)")
    private Double longitude;

    /** 진행률 계산 방식(DB 값). API에서는 getProgressMode()로 manual / auto */
    @Getter(AccessLevel.NONE)
    @Setter(AccessLevel.NONE)
    @Column(name = "progress_calculation_mode", nullable = false, length = 30)
    private String progressCalculationMode = DB_MANUAL;

    /** 공정과 가중치·공정별 진행률(자동 계산 방식). 직접 입력으로 바꿔도 지우지 않고 남겨 둔다 */
    @OneToMany(mappedBy = "site", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC")
    private List<SiteProcess> processes = new ArrayList<>();

    @OneToMany(mappedBy = "site", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("joinedAt ASC")
    private List<SiteMember> members = new ArrayList<>();

    // ---- 보고에서 계산하는 값(DB 칸 없음, 읽을 때 계산) ----

    /** 가장 최근 보고의 '보고 후 진행률' */
    @Setter(AccessLevel.NONE)
    @Formula("(select r.to_progress from reports r where r.site_id = id order by r.created_at desc, r.id desc limit 1)")
    private Double latestReportTo;

    /** 가장 최근 보고의 공정(null이면 직접 입력 보고) */
    @Setter(AccessLevel.NONE)
    @Formula("(select r.process_key from reports r where r.site_id = id order by r.created_at desc, r.id desc limit 1)")
    private String latestReportProcess;

    /** 마지막 보고 시각 */
    @Setter(AccessLevel.NONE)
    @Formula("(select max(r.created_at) from reports r where r.site_id = id)")
    private Instant lastReportedAt;

    public boolean isAuto() {
        return DB_WEIGHTED.equals(progressCalculationMode);
    }

    public String getProgressMode() {
        return isAuto() ? MODE_AUTO : MODE_MANUAL;
    }

    public void setProgressMode(String mode) {
        progressCalculationMode = MODE_AUTO.equals(mode) ? DB_WEIGHTED : DB_MANUAL;
    }

    /**
     * 현장 전체 진행률(%)
     * - 자동 계산: 공정 가중치로 계산
     * - 직접 입력: 가장 최근 보고 값. 자동 계산 중에 올린 공정 보고가 마지막이면(방식을 바꾼 직후) 공정으로 계산한 값에서 이어진다
     */
    public double overallProgress() {
        if (isAuto() || latestReportProcess != null) {
            return weightedProgress();
        }
        return latestReportTo != null ? latestReportTo : 0;
    }

    /** 공정 가중치를 반영한 진행률 = Σ(공정 진행률 × 가중치) ÷ Σ가중치 */
    public double weightedProgress() {
        double total = processes.stream().mapToDouble(SiteProcess::getWeight).sum();
        if (total <= 0) {
            return 0;
        }
        double sum = processes.stream().mapToDouble(p -> p.getProgress() * p.getWeight()).sum();
        return Math.round(sum / total * 10) / 10.0;
    }

    public boolean hasMember(Long userId) {
        return members.stream().anyMatch(m -> m.getUser().getId().equals(userId));
    }

    public boolean isOwner(Long userId) {
        return owner.getId().equals(userId);
    }

    /** 이 현장이 연결된 본사의 관리자인가(보고 검토·자재 승인 권한) */
    public boolean isHqManagerOf(User user) {
        return isHqOf(user) && user.isHqManager();
    }

    /** 이 현장이 연결된 본사의 관계자인가(보기 권한) */
    public boolean isHqOf(User user) {
        return user != null
                && user.getHqCompany() != null
                && company != null
                && company.getId().equals(user.getHqCompany().getId());
    }
}
