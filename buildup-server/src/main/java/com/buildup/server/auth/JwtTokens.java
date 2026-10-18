package com.buildup.server.auth;

import com.buildup.server.user.User;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Optional;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 접근 토큰(access token, JWT, HS256 서명). 기본 60분이 지나면 리프레시 토큰으로 새로 받는다.
 * (리프레시 토큰은 RefreshTokens)
 * - 토큰 안에 사용자 id(sub), 역할(role), 토큰 번호(jti), 만료 시각(exp)이 들어 있고 서버 비밀 키로 서명한다.
 * - 로그아웃하면 바로 막을 수 있도록 토큰 번호(jti)를 DB(auth_tokens)에 기록해 두고, 요청마다 기록이 있는지도 확인한다.
 * - 비밀 키: buildup.jwt-secret(운영은 JWT_SECRET 환경 변수, 32자 이상). 비어 있으면 서버를 켤 때마다 새로 만든다(재시작하면 다시 로그인).
 */
@Component
public class JwtTokens {

    private static final Logger log = LoggerFactory.getLogger(JwtTokens.class);
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String ISSUER = "buildup";

    private final AuthTokenRepository tokens;
    private final Duration validFor;
    private final JwtEncoder encoder;
    private final JwtDecoder decoder;

    public JwtTokens(
            AuthTokenRepository tokens,
            @Value("${buildup.access-minutes:60}") int accessMinutes,
            @Value("${buildup.jwt-secret:}") String secret) {
        this.tokens = tokens;
        this.validFor = Duration.ofMinutes(accessMinutes);
        SecretKey key = new SecretKeySpec(keyBytes(secret), "HmacSHA256");
        this.encoder = NimbusJwtEncoder.withSecretKey(key).build();
        this.decoder = NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
    }

    private static byte[] keyBytes(String secret) {
        if (secret == null || secret.isBlank()) {
            log.warn("buildup.jwt-secret이 없어 임시 비밀 키를 만듭니다. 서버를 다시 켜면 모두 다시 로그인해야 해요.");
            byte[] b = new byte[32];
            RANDOM.nextBytes(b);
            return b;
        }
        byte[] b = secret.getBytes(StandardCharsets.UTF_8);
        if (b.length < 32) {
            throw new IllegalStateException("buildup.jwt-secret은 32자 이상이어야 합니다.");
        }
        return b;
    }

    /** 발급한 접근 토큰과 만료 시각 */
    public record Issued(String value, Instant expiresAt) {}

    /** 로그인 성공·토큰 갱신 → 접근 토큰 발급(토큰 번호를 DB에 기록) */
    @Transactional
    public Issued issue(User user) {
        Instant now = Instant.now();
        // 만료된 기록 정리
        tokens.deleteByCreatedAtBefore(now.minus(validFor));
        byte[] b = new byte[16];
        RANDOM.nextBytes(b);
        String jti = HexFormat.of().formatHex(b);
        tokens.save(new AuthToken(jti, user));
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(ISSUER)
                .subject(String.valueOf(user.getId()))
                .id(jti)
                .issuedAt(now)
                .expiresAt(now.plus(validFor))
                .claim("role", user.getRole().name().toLowerCase())
                .build();
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).type("JWT").build();
        return new Issued(encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue(), now.plus(validFor));
    }

    /** 요청의 토큰 확인: 서명·만료가 맞고, 로그아웃하지 않은 토큰이면 사용자 id */
    @Transactional(readOnly = true)
    public Optional<Long> verify(String token) {
        Jwt jwt = decode(token);
        if (jwt == null || jwt.getId() == null || !ISSUER.equals(jwt.getClaimAsString("iss"))) {
            return Optional.empty();
        }
        Long userId;
        try {
            userId = Long.valueOf(jwt.getSubject());
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
        return tokens.findWithUserByToken(jwt.getId())
                .filter(t -> t.getUser().getId().equals(userId) && !t.getUser().isDisabled())
                .map(t -> userId);
    }

    /** 로그아웃: 토큰 번호 기록을 지워 바로 무효로 */
    @Transactional
    public void revoke(String token) {
        Jwt jwt = decode(token);
        if (jwt != null && jwt.getId() != null) {
            tokens.deleteById(jwt.getId());
        }
    }

    private Jwt decode(String token) {
        if (token == null || token.isBlank() || token.chars().filter(c -> c == '.').count() != 2) {
            return null;
        }
        try {
            return decoder.decode(token);
        } catch (JwtException e) {
            return null; // 서명이 틀렸거나 만료됨
        }
    }

}
