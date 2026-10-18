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
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 작업 현장(카카오워크의 워크스페이스에 해당) */
@Entity
@Table(name = "sites")
@Getter
@Setter
@NoArgsConstructor
public class Site {

    /** 개발·시연용 데모 인테리어 현장의 고정 참여 코드(재발급 불가, 새 현장에는 발급 안 함) */
    public static final String DEMO_CODE = "000000";

    /** 진행률 계산 방식: 직접 입력(보고하는 사람이 판단) / 자동 계산(공정 가중치) */
    public static final String MODE_MANUAL = "manual";
    public static final String MODE_AUTO = "auto";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false, length = 200)
    private String address;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "owner_id")
    private User owner;

    /** 6자리 참여 코드(현장끼리 겹치지 않음) */
    @Column(nullable = false, unique = true, length = 6)
    private String code;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    /** 현장 위치(현장 관리자가 현장에서 '현재 위치로 저장'). 보고 위치 확인에 쓴다. 없으면 확인 안 함 */
    private Double latitude;

    private Double longitude;

    /** 현장 위치를 저장한 시각(이후에 올라온 보고만 위치를 확인한다) */
    private Instant locationUpdatedAt;

    /** 공사 종류(예: 실내건축 공사, 상·하수도 설비 공사, 직접 입력한 이름) */
    @Column(length = 50)
    private String workType;

    /** 현장 전체 진행률(%): 직접 입력 방식은 보고하는 사람이 입력한 값, 자동 계산 방식은 마지막 계산값. null이면 예전 데이터 */
    private Double progress;

    /** 진행률 계산 방식: manual(직접 입력, 기본) | auto(공정 가중치로 자동 계산). null = manual */
    @Column(length = 10)
    private String progressMode;

    /** 마지막 보고 시각 */
    private Instant lastReportedAt;

    /** 연결된 본사(없으면 본사 보고 없이 현장 안에서만 운영) */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id")
    private Company company;

    /** 공정과 가중치·공정별 진행률. 자동 계산 방식에서 쓴다(직접 입력으로 바꿔도 지우지 않고 남겨 둔다) */
    @OneToMany(mappedBy = "site", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC")
    private List<SiteProcess> processes = new ArrayList<>();

    @OneToMany(mappedBy = "site", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("joinedAt ASC")
    private List<SiteMember> members = new ArrayList<>();

    public boolean isAuto() {
        return MODE_AUTO.equals(progressMode);
    }

    /** 현장 전체 진행률(%). 자동 계산 방식은 공정 가중치로 계산, 직접 입력 방식은 보고할 때 입력한 값 */
    public double overallProgress() {
        if (isAuto()) {
            return weightedProgress();
        }
        return progress != null ? progress : weightedProgress();
    }

    /** 예전 데이터 변환용(SiteProgressMigration) */
    public double legacyProgress() {
        return weightedProgress();
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
