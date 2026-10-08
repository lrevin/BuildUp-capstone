package com.buildup.server.report;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ReportRepository extends JpaRepository<Report, Long> {

    @EntityGraph(attributePaths = "author")
    List<Report> findBySiteIdOrderByCreatedAtDescIdDesc(Long siteId);

    /** 현장의 가장 최근 보고 */
    Optional<Report> findFirstBySiteIdOrderByCreatedAtDescIdDesc(Long siteId);

    /** 해당 공정의 가장 최근 보고(예전 방식) */
    Optional<Report> findFirstBySiteIdAndProcessKeyOrderByCreatedAtDescIdDesc(Long siteId, String processKey);

    /** 본사 화면: 여러 현장의 최근 보고 */
    @EntityGraph(attributePaths = {"author", "site"})
    List<Report> findTop100BySiteIdInOrderByCreatedAtDesc(List<Long> siteIds);

    /** 엑셀 작업일보: 기간 안의 보고(오래된 순) */
    @EntityGraph(attributePaths = "author")
    List<Report> findBySiteIdAndCreatedAtGreaterThanEqualAndCreatedAtLessThanOrderByCreatedAtAscIdAsc(
            Long siteId, Instant from, Instant to);

    /**
     * 나눠 불러오기(최신순). 앞 페이지 마지막 보고(at, id)보다 오래된 것만.
     * 첫 페이지는 at=아주 먼 미래, id=가장 큰 값으로 부른다.
     */
    @EntityGraph(attributePaths = {"author", "site"})
    @Query("select r from Report r where r.site.id in :siteIds"
            + " and (:processKey is null or r.processKey = :processKey)"
            + " and (r.createdAt < :at or (r.createdAt = :at and r.id < :id))"
            + " order by r.createdAt desc, r.id desc")
    List<Report> page(List<Long> siteIds, String processKey, Instant at, Long id, Limit limit);

    /** 공정별 보고 수(보고 이력 화면의 필터 숫자) */
    @Query("select r.processKey, count(r) from Report r where r.site.id = :siteId group by r.processKey")
    List<Object[]> countByProcess(Long siteId);

    /** 확인하지 않은 보고 수: since 이후 올라온 보고 */
    long countBySiteIdAndCreatedAtAfter(Long siteId, Instant since);

    long countBySiteId(Long siteId);

    long countBySiteIdAndReviewStatus(Long siteId, String reviewStatus);

    long countByReviewStatus(String reviewStatus);

    long countByCreatedAtAfter(Instant after);

    long countBySiteIdAndReviewStatusAndAuthorIdNot(Long siteId, String reviewStatus, Long authorId);

    boolean existsBySiteIdAndProcessKey(Long siteId, String processKey);

    long countBySiteIdAndAuthorId(Long siteId, Long authorId);

    @Query("select r from Report r where r.site.id = :siteId")
    List<Report> findAllBySiteId(Long siteId);
}
