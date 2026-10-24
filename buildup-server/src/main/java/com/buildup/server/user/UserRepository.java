package com.buildup.server.user;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByEmail(String email);

    /** 본사에 소속된 사람들(활성 소속) */
    @org.springframework.data.jpa.repository.Query(
            "select m.user from CompanyMembership m where m.company.id = :companyId and m.status = 'ACTIVE' order by m.user.id")
    List<User> findByHqCompanyIdOrderById(@org.springframework.data.repository.query.Param("companyId") Long companyId);

    boolean existsByEmail(String email);

}
