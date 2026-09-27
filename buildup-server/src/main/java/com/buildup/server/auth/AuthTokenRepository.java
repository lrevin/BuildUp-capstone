package com.buildup.server.auth;

import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AuthTokenRepository extends JpaRepository<AuthToken, String> {

    @EntityGraph(attributePaths = "user")
    Optional<AuthToken> findWithUserByToken(String token);
}
