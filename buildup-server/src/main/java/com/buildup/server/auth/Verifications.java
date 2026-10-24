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
 * - 6자리 코드: 5분 유효, 다시 받기는 60초 뒤부터, 5번 틀리면 그 코드는 못 쓴다(다시 받기 대기는 그대로)
 * - 인증 완료 토큰: 30분 안에 가입해야 한다(카카오 가입 토큰은 10분). 가입에 쓰면 없어진다
 * - 코드 확인·횟수 세기는 한 번에(동시에 몰아서 보내도 5번 제한이 지켜지게) 처리한다
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
    /** 기억해 두는 최대 개수(요청을 마구 보내 메모리가 끝없이 늘지 않게) */
    static final int MAX_ENTRIES = 20_000;

    private static final SecureRandom RANDOM = new SecureRandom();

    /** codeHash가 null이면 5번 틀려서 못 쓰는 코드(다시 받기 대기 시간만 남김) */
    private record Pending(String codeHash, Instant expiresAt, Instant resendAt, int tries) {}

    /** 인증을 마친 내용. data는 카카오 가입 때 받은 정보(이메일, 이름) */
    public record Granted(Kind kind, String target, Map<String, String> data, Instant expiresAt) {}

    private final Map<String, Pending> codes = new ConcurrentHashMap<>();
    private final Map<String, Granted> tokens = new ConcurrentHashMap<>();

    /** 새 6자리 코드를 만든다(60초 안에 다시 요청하면 429) */
    public String newCode(Kind kind, String target) {
        cleanUp();
        String code = String.format("%06d", RANDOM.nextInt(1_000_000));
        codes.compute(kind + ":" + target, (k, old) -> {
            Instant now = Instant.now();
            if (old != null && now.isBefore(old.resendAt())) {
                long sec = Duration.between(now, old.resendAt()).toSeconds() + 1;
                throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, sec + "초 뒤에 다시 받을 수 있어요.");
            }
            return new Pending(hash(code), now.plus(CODE_TTL), now.plus(RESEND_AFTER), 0);
        });
        return code;
    }

    /** 코드 확인 → 맞으면 인증 완료 토큰 */
    public String verify(Kind kind, String target, String code) {
        String input = code == null ? "" : code.trim();
        // 결과를 compute 밖으로 꺼내기 위한 칸: 0 맞음, 그 밖은 오류 메시지
        String[] outcome = new String[1];
        int[] status = new int[] {400};
        codes.compute(kind + ":" + target, (k, p) -> {
            Instant now = Instant.now();
            if (p == null) {
                outcome[0] = "인증 코드를 먼저 받아 주세요.";
                return null;
            }
            if (p.codeHash() == null) {
                outcome[0] = "인증 코드를 " + MAX_TRIES + "번 틀렸어요. 코드를 다시 받아 주세요.";
                status[0] = 429;
                return p;
            }
            if (now.isAfter(p.expiresAt())) {
                outcome[0] = "인증 코드가 만료됐어요. 다시 받아 주세요.";
                return dead(p);
            }
            if (MessageDigest.isEqual(p.codeHash().getBytes(StandardCharsets.UTF_8),
                    hash(input).getBytes(StandardCharsets.UTF_8))) {
                outcome[0] = null;
                return null; // 맞음: 코드는 지운다
            }
            int tries = p.tries() + 1;
            if (tries >= MAX_TRIES) {
                outcome[0] = "인증 코드를 " + MAX_TRIES + "번 틀렸어요. 코드를 다시 받아 주세요.";
                status[0] = 429;
                return dead(p);
            }
            outcome[0] = "인증 코드가 맞지 않아요. (" + (MAX_TRIES - tries) + "번 남음)";
            return new Pending(p.codeHash(), p.expiresAt(), p.resendAt(), tries);
        });
        if (outcome[0] != null) {
            throw new ApiException(HttpStatus.valueOf(status[0]), outcome[0]);
        }
        return grant(kind, target, Map.of(), TOKEN_TTL);
    }

    /** 못 쓰게 된 코드: 다시 받기 대기 시간만 남긴다(바로 새 코드를 받아 계속 시도하지 못하게) */
    private static Pending dead(Pending p) {
        return new Pending(null, p.expiresAt(), p.resendAt(), p.tries());
    }

    /** 인증 완료 토큰 만들기 */
    public String grant(Kind kind, String target, Map<String, String> data, Duration ttl) {
        cleanUp();
        byte[] b = new byte[24];
        RANDOM.nextBytes(b);
        String token = prefix(kind) + HexFormat.of().formatHex(b);
        tokens.put(token, new Granted(kind, target, Map.copyOf(data), Instant.now().plus(ttl)));
        return token;
    }

    /** 토큰 꺼내 쓰기(한 번만): 동시에 같은 토큰으로 가입해도 한 번만 통과한다. 맞지 않으면 그대로 두고 null */
    public Granted take(String token, Kind kind) {
        if (token == null || token.isBlank()) {
            return null;
        }
        Granted[] taken = new Granted[1];
        tokens.computeIfPresent(token.trim(), (k, g) -> {
            if (g.kind() != kind || Instant.now().isAfter(g.expiresAt())) {
                return g;
            }
            taken[0] = g;
            return null;
        });
        return taken[0];
    }

    /** 가입이 실패했을 때 꺼낸 토큰을 되돌려 놓는다(다시 인증하지 않아도 되게) */
    public void putBack(String token, Granted g) {
        if (token != null && g != null && Instant.now().isBefore(g.expiresAt())) {
            tokens.putIfAbsent(token.trim(), g);
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

    /** 오래된 것 정리, 그래도 너무 많으면 잠시 거절 */
    private void cleanUp() {
        Instant now = Instant.now();
        if (codes.size() > MAX_ENTRIES / 2) {
            codes.values().removeIf(p -> now.isAfter(p.resendAt()) && now.isAfter(p.expiresAt()));
        }
        if (tokens.size() > MAX_ENTRIES / 2) {
            tokens.values().removeIf(g -> now.isAfter(g.expiresAt()));
        }
        if (codes.size() > MAX_ENTRIES || tokens.size() > MAX_ENTRIES) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "요청이 너무 많아요. 잠시 뒤에 다시 시도해 주세요.");
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
