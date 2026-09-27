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

    /** 연결된 본사(없으면 본사 보고 없이 현장 안에서만 운영) */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id")
    private Company company;

    @OneToMany(mappedBy = "site", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC")
    private List<SiteProcess> processes = new ArrayList<>();

    @OneToMany(mappedBy = "site", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("joinedAt ASC")
    private List<SiteMember> members = new ArrayList<>();

    /** 공정 비중을 반영한 전체 진행률(%). 비중은 상대값(합이 1이 아니어도 됨), 공정이 없으면 0 */
    public double overallProgress() {
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
