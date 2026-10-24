package com.buildup.server.auth;

import com.buildup.server.common.ApiException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * 가입 인증 코드와 인증 완료 표시(토큰)를 잠깐 기억한다.
 * - 6자리 코드: 5분 유효, 다시 받기는 60초 뒤부터, 5번 틀리면 그 코드는 버린다
 * - 인증 완료 토큰: 30분 안에 가입해야 한다(카카오 가입 토큰은 10분)
 * - 서버 메모리에만 기억한다(서버 1대 기준. 서버를 다시 켜면 다시 인증)
 */
@Component
public class Verifications {

    public enum Kind { EMAIL, PHONE, KAKAO }

    static final Duration CODE_TTL = Duration.ofMinutes(5);
    static final Duration RESEND_AFTER = Duration.ofSeconds(60);
    static final Duration TOKEN_TTL = Duration.ofMinutes(30);
    static final Duration KAKAO_TTL = Duration.ofMinutes(10);
    static final int MAX_TRIES = 5;

    private static final SecureRandom RANDOM = new SecureRandom();

    private record Pending(String codeHash, Instant expiresAt, Instant resendAt, int tries) {}

    /** 인증을 마친 내용. data는 카카오 가입 때 받은 정보(회원번호, 이메일, 이름) */
    public record Granted(Kind kind, String target, Map<String, String> data, Instant expiresAt) {}

    private final Map<String, Pending> codes = new ConcurrentHashMap<>();
    private final Map<String, Granted> tokens = new ConcurrentHashMap<>();

    /** 새 6자리 코드를 만든다(60초 안에 다시 요청하면 429) */
    public String newCode(Kind kind, String target) {
        Instant now = Instant.now();
        String key = kind + ":" + target;
        Pending old = codes.get(key);
        if (old != null && now.isBefore(old.resendAt())) {
            long sec = Duration.between(now, old.resendAt()).toSeconds() + 1;
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, sec + "초 뒤에 다시 받을 수 있어요.");
        }
        String code = String.format("%06d", RANDOM.nextInt(1_000_000));
        codes.put(key, new Pending(hash(code), now.plus(CODE_TTL), now.plus(RESEND_AFTER), 0));
        cleanUp(now);
        return code;
    }

    /** 코드 확인 → 맞으면 인증 완료 토큰 */
    public String verify(Kind kind, String target, String code) {
        Instant now = Instant.now();
        String key = kind + ":" + target;
        Pending p = codes.get(key);
        if (p == null) {
            throw ApiException.badRequest("인증 코드를 먼저 받아 주세요.");
        }
        if (now.isAfter(p.expiresAt())) {
            codes.remove(key);
            throw ApiException.badRequest("인증 코드가 만료됐어요. 다시 받아 주세요.");
        }
        String input = code == null ? "" : code.trim();
        if (!MessageDigest.isEqual(p.codeHash().getBytes(StandardCharsets.UTF_8),
                hash(input).getBytes(StandardCharsets.UTF_8))) {
            int tries = p.tries() + 1;
            if (tries >= MAX_TRIES) {
                codes.remove(key);
                throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "인증 코드를 " + MAX_TRIES + "번 틀렸어요. 코드를 다시 받아 주세요.");
            }
            codes.put(key, new Pending(p.codeHash(), p.expiresAt(), p.resendAt(), tries));
            throw ApiException.badRequest("인증 코드가 맞지 않아요. (" + (MAX_TRIES - tries) + "번 남음)");
        }
        codes.remove(key);
        return grant(kind, target, Map.of(), TOKEN_TTL);
    }

    /** 인증 완료 토큰 만들기 */
    public String grant(Kind kind, String target, Map<String, String> data, Duration ttl) {
        byte[] b = new byte[24];
        RANDOM.nextBytes(b);
        String token = prefix(kind) + HexFormat.of().formatHex(b);
        tokens.put(token, new Granted(kind, target, Map.copyOf(data), Instant.now().plus(ttl)));
        return token;
    }

    /** 토큰 확인(가입이 끝날 때까지 지우지 않는다: 다른 칸이 틀려 다시 보내도 또 인증할 필요 없게) */
    public Granted find(String token, Kind kind) {
        if (token == null || token.isBlank()) {
            return null;
        }
        Granted g = tokens.get(token.trim());
        if (g == null || g.kind() != kind || Instant.now().isAfter(g.expiresAt())) {
            return null;
        }
        return g;
    }

    /** 가입이 끝나면 쓴 토큰을 지운다 */
    public void consume(String... used) {
        for (String t : used) {
            if (t != null) {
                tokens.remove(t.trim());
            }
        }
    }

    public long ttlSeconds(Kind kind) {
        return (kind == Kind.KAKAO ? KAKAO_TTL : TOKEN_TTL).toSeconds();
    }

    private static String prefix(Kind kind) {
        return switch (kind) {
            case EMAIL -> "ev_";
            case PHONE -> "pv_";
            case KAKAO -> "st_";
        };
    }

    private void cleanUp(Instant now) {
        if (codes.size() > 10_000) {
            codes.values().removeIf(p -> now.isAfter(p.expiresAt()));
        }
        if (tokens.size() > 10_000) {
            tokens.values().removeIf(g -> now.isAfter(g.expiresAt()));
        }
    }

    private static String hash(String code) {
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(code.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
