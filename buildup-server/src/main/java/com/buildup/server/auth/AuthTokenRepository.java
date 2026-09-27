package com.buildup.server.auth;

import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AuthTokenRepository extends JpaRepository<AuthToken, String> {

    @EntityGraph(attributePaths = "user")
    Optional<AuthToken> findWithUserByToken(String token);

    /** 만료된 로그인 기록 정리 */
    void deleteByCreatedAtBefore(Instant before);

    /** 계정 사용 중지 → 모든 기기에서 로그아웃 */
    void deleteByUserId(Long userId);
}
