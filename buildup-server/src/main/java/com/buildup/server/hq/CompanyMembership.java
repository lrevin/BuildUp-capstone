package com.buildup.server.hq;

import com.buildup.server.user.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 본사 소속 (DB 설계 V11 `company_memberships`): HQ_MANAGER(본사 관리자) | HQ_MEMBER(본사 일반 직원) */
@Entity
@Table(
        name = "company_memberships",
        uniqueConstraints = @UniqueConstraint(columnNames = {"company_id", "user_id"}))
@Getter
@Setter
@NoArgsConstructor
public class CompanyMembership {

    public static final String HQ_MANAGER = "HQ_MANAGER";
    public static final String HQ_MEMBER = "HQ_MEMBER";
    public static final String ACTIVE = "ACTIVE";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "company_id")
    private Company company;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id")
    private User user;

    @Column(nullable = false, length = 30)
    private String role;

    @Column(nullable = false, length = 20)
    private String status = ACTIVE;

    @Column(nullable = false, columnDefinition = "datetime(6)")
    private Instant joinedAt = Instant.now();

    public CompanyMembership(Company company, User user, String role) {
        this.company = company;
        this.user = user;
        this.role = role;
    }
}
