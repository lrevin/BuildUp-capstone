package com.buildup.server.material;

import java.util.List;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface MaterialRequestRepository extends JpaRepository<MaterialRequest, Long> {

    @EntityGraph(attributePaths = {"author", "site"})
    List<MaterialRequest> findBySiteIdOrderByCreatedAtDescIdDesc(Long siteId);

    /** 본사 화면: 연결된 여러 현장의 요청 */
    @EntityGraph(attributePaths = {"author", "site"})
    List<MaterialRequest> findBySiteIdInOrderByCreatedAtDescIdDesc(List<Long> siteIds);

    long countBySiteIdAndStatus(Long siteId, String status);

    long countByStatus(String status);

    @Query("select m from MaterialRequest m where m.site.id = :siteId")
    List<MaterialRequest> findAllBySiteId(Long siteId);
}
