package com.buildup.server.site;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface SiteRepository extends JpaRepository<Site, Long> {

    Optional<Site> findByCode(String code);

    boolean existsByCode(String code);

    @Query("select s from Site s where exists "
            + "(select 1 from SiteMember m where m.site = s and m.user.id = :userId) order by s.id")
    List<Site> findJoinedBy(Long userId);

    @org.springframework.data.jpa.repository.Query("select s from Site s where s.owner.id = :userId")
    List<Site> findOwnedBy(Long userId);

    /** 본사에 연결된 현장 */
    List<Site> findByCompanyIdOrderById(Long companyId);

    /** 현장 관리자가 보고하는 본사 = 가장 최근에 만든, 본사에 연결된 내 현장의 본사 */
    Optional<Site> findFirstByOwnerIdAndCompanyIsNotNullOrderByCreatedAtDescIdDesc(Long ownerId);
}
