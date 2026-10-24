package com.buildup.server.auth;

import com.buildup.server.common.ApiException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * 앱의 카카오 로그인(카카오 SDK 없이 휴대폰 브라우저로):
 *   1) 앱이 POST /api/auth/oauth/kakao/begin → { url, key }. key는 앱만 기억한다
 *   2) 앱이 url(GET /api/auth/oauth/kakao/start?state=...)을 브라우저로 연다 → 카카오 로그인 화면
 *   3) 카카오가 GET /api/auth/oauth/kakao/callback 으로 돌려보냄 → 서버가 로그인 처리 후 결과를 일회용 티켓에 담아
 *      buildupapp://oauth/kakao?ticket=... 로 앱을 연다
 *   4) 앱이 POST /api/auth/oauth/kakao/ticket { ticket, key } 로 결과를 받는다
 * 결과는 1)에서 받은 key가 있어야 꺼낼 수 있다 → 다른 사람이 만든 로그인 링크를 내 휴대폰에서 열어도
 * (내 앱에는 그 key가 없으니) 남의 계정으로 로그인되거나 남의 카카오가 내 계정에 붙지 않는다.
 * state·티켓은 서버 메모리에만 잠깐(state 10분, 티켓 2분, 한 번만 사용) 기억한다.
 */
@Component
public class KakaoAppLogin {

    static final Duration STATE_TTL = Duration.ofMinutes(10);
    static final Duration TICKET_TTL = Duration.ofMinutes(2);
    static final int MAX_ENTRIES = 5_000;
    private static final SecureRandom RANDOM = new SecureRandom();

    /** 결과: 성공(body) 또는 실패(status, message) */
    public record Result(Object body, int status, String message) {}

    /** 시작한 로그인: state → 앱의 key */
    public record Started(String state, String key) {}

    private record Entry<T>(T value, String key, Instant expiresAt) {}

    private final Map<String, Entry<Boolean>> states = new ConcurrentHashMap<>();
    private final Map<String, Entry<Result>> tickets = new ConcurrentHashMap<>();

    public Started begin() {
        cleanUp();
        Started s = new Started(random(), random());
        states.put(s.state(), new Entry<>(true, s.key(), Instant.now().plus(STATE_TTL)));
        return s;
    }

    /** 앱이 시작한 state인지(아직 쓰지 않음): 맞으면 그 key, 아니면 null */
    public String keyOf(String state) {
        Entry<Boolean> e = state == null ? null : states.get(state);
        return e != null && Instant.now().isBefore(e.expiresAt()) ? e.key() : null;
    }

    /** 카카오가 돌려준 state 쓰기(한 번만): 맞으면 그 key, 아니면 null */
    public String useState(String state) {
        Entry<Boolean> e = state == null ? null : states.remove(state);
        return e != null && Instant.now().isBefore(e.expiresAt()) ? e.key() : null;
    }

    public String ticket(Result result, String key) {
        cleanUp();
        String t = random();
        tickets.put(t, new Entry<>(result, key, Instant.now().plus(TICKET_TTL)));
        return t;
    }

    /** 티켓으로 결과 받기(한 번만, 로그인을 시작한 앱의 key가 맞아야). 실패 결과였으면 그 오류를 그대로 */
    public Object redeem(String ticket, String key) {
        Entry<Result> e = ticket == null ? null : tickets.get(ticket.trim());
        if (e == null || Instant.now().isAfter(e.expiresAt())) {
            throw ApiException.badRequest("카카오 로그인 시간이 지났어요. 다시 시도해 주세요.");
        }
        if (key == null || !MessageDigest.isEqual(
                e.key().getBytes(StandardCharsets.UTF_8), key.trim().getBytes(StandardCharsets.UTF_8))) {
            throw ApiException.forbidden("이 휴대폰에서 시작한 카카오 로그인이 아니에요. 앱에서 다시 시도해 주세요.");
        }
        if (!tickets.remove(ticket.trim(), e)) {
            throw ApiException.badRequest("카카오 로그인 시간이 지났어요. 다시 시도해 주세요.");
        }
        Result r = e.value();
        if (r.body() == null) {
            throw new ApiException(HttpStatus.valueOf(r.status()), r.message());
        }
        return r.body();
    }

    private void cleanUp() {
        Instant now = Instant.now();
        if (states.size() > MAX_ENTRIES / 2) {
            states.values().removeIf(x -> now.isAfter(x.expiresAt()));
        }
        if (tickets.size() > MAX_ENTRIES / 2) {
            tickets.values().removeIf(x -> now.isAfter(x.expiresAt()));
        }
        if (states.size() > MAX_ENTRIES || tickets.size() > MAX_ENTRIES) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "요청이 너무 많아요. 잠시 뒤에 다시 시도해 주세요.");
        }
    }

    private static String random() {
        byte[] b = new byte[24];
        RANDOM.nextBytes(b);
        return HexFormat.of().formatHex(b);
    }
}
