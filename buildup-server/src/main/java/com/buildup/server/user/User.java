package com.buildup.server.user;

import com.buildup.server.hq.Company;
import com.buildup.server.hq.CompanyMembership;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * 사용자 (DB 설계 V11 `users`)
 * - users.role: USER(작업자) | SITE_ADMIN(현장 관리자) | SYSTEM_ADMIN(시스템 관리자)
 *   시스템 관리자가 사용을 중지한 계정은 앞에 DISABLED_를 붙인다(예: DISABLED_USER)
 * - 본사 관계자는 company_memberships(HQ_MANAGER / HQ_MEMBER)로 구분한다
 * - API 역할(worker / admin / hq / system)은 getRole()로 계산한다
 */
@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
public class User {

    public static final String DB_USER = "USER";
    public static final String DB_SITE_ADMIN = "SITE_ADMIN";
    public static final String DB_SYSTEM_ADMIN = "SYSTEM_ADMIN";
    private static final String DISABLED = "DISABLED_";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 50)
    private String name;

    @Column(nullable = false, unique = true, length = 255)
    private String email;

    @Column(length = 30)
    private String phone;

    /** DB에 저장하는 역할 값(위 설명). 화면·API에서는 getRole()을 쓴다 */
    @Getter(AccessLevel.NONE)
    @Setter(AccessLevel.NONE)
    @Column(name = "role", nullable = false, length = 30)
    private String dbRole = DB_USER;

    @Column(nullable = false, length = 255)
    private String passwordHash;

    @Column(nullable = false, columnDefinition = "datetime(6)")
    private Instant createdAt = Instant.now();

    /** 본사 소속(한 사람은 활성 소속 하나) */
    @Getter(AccessLevel.NONE)
    @OneToMany(mappedBy = "user", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<CompanyMembership> memberships = new ArrayList<>();

    // ---- 역할 ----

    private String baseRole() {
        return dbRole.startsWith(DISABLED) ? dbRole.substring(DISABLED.length()) : dbRole;
    }

    /** API 역할: system > hq(본사 소속) > admin(현장 관리자) > worker */
    public Role getRole() {
        String base = baseRole();
        if (DB_SYSTEM_ADMIN.equals(base)) {
            return Role.SYSTEM;
        }
        if (activeMembership() != null) {
            return Role.HQ;
        }
        return DB_SITE_ADMIN.equals(base) ? Role.ADMIN : Role.WORKER;
    }

    /** 본사(HQ)는 본사 소속으로 정해지므로 여기서는 USER로 둔다(setHqCompany로 소속을 만든다) */
    public void setRole(Role role) {
        String base = switch (role) {
            case ADMIN -> DB_SITE_ADMIN;
            case SYSTEM -> DB_SYSTEM_ADMIN;
            default -> DB_USER;
        };
        dbRole = isDisabled() ? DISABLED + base : base;
    }

    public boolean isDisabled() {
        return dbRole.startsWith(DISABLED);
    }

    public void setDisabled(boolean disabled) {
        dbRole = disabled ? DISABLED + baseRole() : baseRole();
    }

    // ---- 본사 소속 ----

    public CompanyMembership activeMembership() {
        return memberships.stream()
                .filter(m -> CompanyMembership.ACTIVE.equals(m.getStatus()))
                .findFirst()
                .orElse(null);
    }

    /** 본사 관계자의 소속 본사(없으면 null) */
    public Company getHqCompany() {
        CompanyMembership m = activeMembership();
        return m == null ? null : m.getCompany();
    }

    /** 본사 소속 정하기: manager=true면 본사 관리자(HQ_MANAGER, 보고 검토·자재 승인 가능) */
    public void joinCompany(Company company, boolean manager) {
        memberships.clear();
        memberships.add(new CompanyMembership(
                company, this, manager ? CompanyMembership.HQ_MANAGER : CompanyMembership.HQ_MEMBER));
    }

    /** 본사 관리자인가 */
    public boolean isHqManager() {
        CompanyMembership m = activeMembership();
        return m != null && CompanyMembership.HQ_MANAGER.equals(m.getRole());
    }

    /** 표시용 회사명: 본사 관계자는 소속 본사명(현장 관리자의 회사명은 V11 설계에 없음) */
    public String getCompany() {
        Company c = getHqCompany();
        return c == null ? null : c.getName();
    }
}
