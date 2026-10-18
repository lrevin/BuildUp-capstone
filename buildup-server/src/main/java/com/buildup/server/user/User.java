package com.buildup.server.user;

import com.buildup.server.hq.Company;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 50)
    private String name;

    @Column(nullable = false, unique = true, length = 120)
    private String email;

    @Column(nullable = false, length = 20)
    private String phone;

    // MySQL enum 타입이 아니라 일반 글자 칸으로(역할이 늘어나도 칸을 바꿀 필요 없게)
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10, columnDefinition = "varchar(10)")
    private Role role;

    /** 총관리자만 입력(소속 회사명) */
    @Column(length = 80)
    private String company;

    /** 본사 관계자만: 소속 본사 */
    @ManyToOne
    @JoinColumn(name = "hq_company_id")
    private Company hqCompany;

    /**
     * 본사 관계자만: 본사 관리자 여부(보고 검토·자재 승인 가능).
     * 새 본사를 등록한 사람 true, 본사 코드로 합류한 사람 false. null(이 값이 생기기 전 계정)은 관리자로 본다.
     */
    private Boolean hqManager;

    /** 본사 관리자인가(본사 관계자 + 관리자) */
    public boolean isHqManager() {
        return role == Role.HQ && hqCompany != null && !Boolean.FALSE.equals(hqManager);
    }

    /**
     * 현장 관리자만: 보고하는 본사. 없으면 본사 없이 운영하는 최고 책임자.
     * 이 관리자가 새로 만드는 현장은 이 본사에 자동으로 연결된다.
     */
    @ManyToOne
    @JoinColumn(name = "manager_company_id")
    private Company managerCompany;

    @Column(nullable = false, length = 100)
    private String passwordHash;

    /** 시스템 관리자가 사용을 중지한 계정(로그인 불가) */
    @Column(nullable = false, columnDefinition = "boolean default false")
    private boolean disabled;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();
}
