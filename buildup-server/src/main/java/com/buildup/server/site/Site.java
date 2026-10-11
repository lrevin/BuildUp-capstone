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

    /** 현장 전체 진행률(%): 보고하는 사람이 직접 판단해 입력한 값. null이면 예전 방식(공정 비중) 데이터 */
    private Double progress;

    /** 마지막 보고 시각 */
    private Instant lastReportedAt;

    /** 연결된 본사(없으면 본사 보고 없이 현장 안에서만 운영) */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id")
    private Company company;

    /** 예전 방식(공정별 진행률) 데이터. 새 방식으로 바꾼 뒤에는 쓰지 않는다(SiteProgressMigration) */
    @OneToMany(mappedBy = "site", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC")
    private List<SiteProcess> processes = new ArrayList<>();

    @OneToMany(mappedBy = "site", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("joinedAt ASC")
    private List<SiteMember> members = new ArrayList<>();

    /** 현장 전체 진행률(%). 보고할 때 입력한 값 그대로 */
    public double overallProgress() {
        return progress != null ? progress : legacyProgress();
    }

    /** 예전 방식: 공정 비중을 반영한 진행률(바꾸기 전 데이터에서만 쓴다) */
    public double legacyProgress() {
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

    /** 이 현장이 연결된 본사의 관계자인가 */
    public boolean isHqOf(User user) {
        return user != null
                && user.getHqCompany() != null
                && company != null
                && company.getId().equals(user.getHqCompany().getId());
    }
}
