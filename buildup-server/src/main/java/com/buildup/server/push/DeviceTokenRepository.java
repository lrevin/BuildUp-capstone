package com.buildup.server.push;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface DeviceTokenRepository extends JpaRepository<DeviceToken, Long> {

    Optional<DeviceToken> findByToken(String token);

    @Query("select d.token from DeviceToken d where d.user.id in :userIds")
    List<String> tokensOf(Collection<Long> userIds);

    long countByUserId(Long userId);

    @Modifying
    @Query("delete from DeviceToken d where d.token = :token and d.user.id = :userId")
    int deleteMine(String token, Long userId);

    @Modifying
    @Query("delete from DeviceToken d where d.token in :tokens")
    int deleteTokens(Collection<String> tokens);
}
