package com.buildup.server.auth;

import com.buildup.server.common.ApiException;
import com.buildup.server.user.User;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** 리프레시 토큰 발급·확인·폐기(원래 값은 앱에만, 서버에는 SHA-256 해시만) */
@Component
public class RefreshTokens {

    private static final SecureRandom RANDOM = new SecureRandom();

    private final RefreshTokenRepository repo;
    private final Duration validFor;

    public RefreshTokens(RefreshTokenRepository repo, @Value("${buildup.login-days:30}") int loginDays) {
        this.repo = repo;
        this.validFor = Duration.ofDays(loginDays);
    }

    public record Issued(String value, Instant expiresAt) {}

    @Transactional
    public Issued issue(User user) {
        Instant now = Instant.now();
        repo.deleteByExpiresAtBefore(now); // 만료된 기록 정리
        byte[] b = new byte[32];
        RANDOM.nextBytes(b);
        String raw = Base64.getUrlEncoder().withoutPadding().encodeToString(b);
        Instant expiresAt = now.plus(validFor);
        repo.save(new RefreshToken(hash(raw), user, expiresAt));
        return new Issued(raw, expiresAt);
    }

    /** 쓸 수 있는 리프레시 토큰(없거나 만료·폐기면 401 → 앱은 다시 로그인) */
    @Transactional(readOnly = true)
    public RefreshToken find(String raw) {
        if (raw == null || raw.isBlank()) {
            throw invalid();
        }
        return repo.findByTokenHash(hash(raw))
                .filter(t -> t.usable(Instant.now()))
                .orElseThrow(RefreshTokens::invalid);
    }

    @Transactional
    public void revoke(String raw) {
        if (raw == null || raw.isBlank()) {
            return;
        }
        repo.findByTokenHash(hash(raw)).ifPresent(t -> {
            if (t.getRevokedAt() == null) {
                t.setRevokedAt(Instant.now());
            }
        });
    }

    private static ApiException invalid() {
        return ApiException.unauthorized("로그인이 만료되었어요. 다시 로그인해 주세요.");
    }

    private static String hash(String raw) {
        try {
            MessageDigest d = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(d.digest(raw.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
