package com.buildup.server.auth;

import com.buildup.server.common.ApiException;
import com.buildup.server.site.Site;
import com.buildup.server.site.SiteRepository;
import com.buildup.server.site.SiteService;
import com.buildup.server.user.Role;
import com.buildup.server.user.User;
import com.buildup.server.user.UserRepository;
import jakarta.persistence.EntityManager;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 회원 탈퇴.
 * 1) 탈퇴 신청: 바로 로그아웃(리프레시 토큰 폐기, 알림 기기 삭제)되고 로그인·같은 이메일 가입이 막힌다.
 * 2) 7일 뒤(1시간마다 확인) 계정 정보를 영구 삭제한다.
 *    - 내가 만든 현장은 보고·자재 요청까지 모두 삭제
 *    - 참여 기록, 본사 소속, 카카오 연결, 알림, 로그인 기록 삭제
 *    - 다른 사람 현장에 남긴 보고·자재 요청·검토 기록이 있으면 그 기록은 두고
 *      계정은 이름 '탈퇴한 사용자'만 남긴 빈 계정으로 바꾼다(이메일·휴대폰·비밀번호 삭제). 없으면 계정 행까지 삭제.
 */
@Service
public class AccountDeletion {

    public static final Duration GRACE = Duration.ofDays(7);
    public static final String WITHDRAWN_NAME = "탈퇴한 사용자";
    private static final String WITHDRAWN_EMAIL_DOMAIN = "@deleted.invalid";
    private static final Logger log = LoggerFactory.getLogger(AccountDeletion.class);

    private final UserRepository users;
    private final SiteRepository sites;
    private final SiteService siteService;
    private final EntityManager em;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final boolean seedDemo;

    public AccountDeletion(
            UserRepository users,
            SiteRepository sites,
            SiteService siteService,
            EntityManager em,
            JdbcTemplate jdbc,
            TransactionTemplate tx,
            @Value("${buildup.seed-demo:true}") boolean seedDemo) {
        this.users = users;
        this.sites = sites;
        this.siteService = siteService;
        this.em = em;
        this.jdbc = jdbc;
        this.tx = tx;
        this.seedDemo = seedDemo;
    }

    /** 탈퇴 신청 → 영구 삭제 예정 시각 */
    @Transactional
    public Instant withdraw(Long userId) {
        User u = users.findById(userId).orElseThrow(() -> ApiException.unauthorized("로그인이 필요합니다."));
        if (u.isWithdrawn()) {
            return u.getDeletedAt().plus(GRACE);
        }
        if (u.getRole() == Role.SYSTEM) {
            throw ApiException.forbidden("시스템 관리자 계정은 탈퇴할 수 없어요.");
        }
        if (seedDemo && u.getEmail().endsWith("@buildup.kr")) {
            throw ApiException.badRequest("발표용 예시 계정은 탈퇴할 수 없어요.");
        }
        Instant now = Instant.now();
        u.setDeletedAt(now);
        em.createQuery("update RefreshToken t set t.revokedAt = :now where t.user.id = :id and t.revokedAt is null")
                .setParameter("now", now)
                .setParameter("id", userId)
                .executeUpdate();
        em.createQuery("delete from DeviceToken d where d.user.id = :id").setParameter("id", userId).executeUpdate();
        return now.plus(GRACE);
    }

    /** 7일이 지난 탈퇴 계정 영구 삭제(서버가 켜진 뒤 1분, 그 뒤 1시간마다) */
    @Scheduled(initialDelay = 60_000, fixedDelay = 3_600_000)
    public void purgeExpired() {
        purgeWithdrawnBefore(Instant.now().minus(GRACE));
    }

    /** cutoff 전에 탈퇴한 계정을 하나씩(각각 따로 저장) 삭제 → 삭제한 수 */
    public int purgeWithdrawnBefore(Instant cutoff) {
        List<Long> ids = em.createQuery(
                        "select u.id from User u where u.deletedAt < :cutoff and u.email not like :done", Long.class)
                .setParameter("cutoff", cutoff)
                .setParameter("done", "%" + WITHDRAWN_EMAIL_DOMAIN)
                .getResultList();
        int done = 0;
        for (Long id : ids) {
            try {
                tx.executeWithoutResult(status -> purge(id));
                done++;
            } catch (RuntimeException e) {
                log.warn("탈퇴 계정 {} 삭제 실패: {}", id, e.getMessage());
            }
        }
        if (done > 0) {
            log.info("탈퇴 계정 {}개를 영구 삭제했어요.", done);
        }
        return done;
    }

    private void purge(Long userId) {
        // 내가 만든 현장(보고·자재 요청·사진 포함) 삭제
        for (Site s : sites.findOwnedBy(userId)) {
            siteService.delete(userId, s.getId());
        }
        em.flush();
        em.clear();

        delete("delete from SiteMember m where m.user.id = :id", userId);
        delete("delete from RefreshToken t where t.user.id = :id", userId);
        delete("delete from DeviceToken d where d.user.id = :id", userId);
        delete("delete from SocialAccount s where s.user.id = :id", userId);
        if (tableExists("notifications")) {
            jdbc.update("delete from notifications where user_id = ?", userId);
        }

        User u = users.findById(userId).orElse(null);
        if (u == null) {
            return;
        }
        u.leaveCompanies();
        if (hasWorkRecords(userId)) {
            // 다른 현장의 보고·자재 기록은 남기고 계정 정보만 지운다
            u.setName(WITHDRAWN_NAME);
            u.setEmail("deleted-" + userId + WITHDRAWN_EMAIL_DOMAIN);
            u.setPhone(null);
            u.setPasswordHash(null);
            u.setEmailVerifiedAt(null);
            u.setPhoneVerifiedAt(null);
            u.setDisabled(true);
            jdbc.update("update material_request_events set actor = ? where actor_user_id = ?", WITHDRAWN_NAME, userId);
        } else {
            users.delete(u);
        }
        em.flush();
    }

    /** 다른 사람 현장에 남긴 보고·자재 요청·검토 기록이 있는가 */
    private boolean hasWorkRecords(Long userId) {
        return count("select count(r) from Report r where r.author.id = :id", userId)
                + count("select count(m) from MaterialRequest m where m.author.id = :id", userId)
                + count("select count(e) from ReportReviewEvent e where e.reviewer.id = :id", userId)
                + count("select count(e) from MaterialRequest m join m.events e where e.actorUser.id = :id", userId)
                > 0;
    }

    private long count(String jpql, Long userId) {
        return em.createQuery(jpql, Long.class).setParameter("id", userId).getSingleResult();
    }

    private void delete(String jpql, Long userId) {
        em.createQuery(jpql).setParameter("id", userId).executeUpdate();
    }

    private boolean tableExists(String table) {
        Integer n = jdbc.queryForObject(
                "select count(*) from information_schema.tables where lower(table_name) = ?", Integer.class, table);
        return n != null && n > 0;
    }
}
