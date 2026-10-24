package com.buildup.server.auth;

import com.buildup.server.common.ApiException;
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
 *   1) 앱이 GET /api/auth/oauth/kakao/start 를 브라우저로 연다 → 카카오 로그인 화면으로 이동(state 발급)
 *   2) 카카오가 GET /api/auth/oauth/kakao/callback 으로 돌려보냄 → 서버가 로그인 처리 후 결과를 일회용 티켓에 담아
 *      buildupapp://oauth/kakao?ticket=... 로 앱을 연다
 *   3) 앱이 POST /api/auth/oauth/kakao/ticket { ticket } 으로 결과(로그인 응답 또는 가입 필요)를 받는다
 * state·티켓은 서버 메모리에만 잠깐(state 10분, 티켓 2분, 한 번만 사용) 기억한다.
 */
@Component
public class KakaoAppLogin {

    static final Duration STATE_TTL = Duration.ofMinutes(10);
    static final Duration TICKET_TTL = Duration.ofMinutes(2);
    private static final SecureRandom RANDOM = new SecureRandom();

    /** 결과: 성공(body) 또는 실패(status, message) */
    public record Result(Object body, int status, String message) {}

    private record Entry<T>(T value, Instant expiresAt) {}

    private final Map<String, Entry<Boolean>> states = new ConcurrentHashMap<>();
    private final Map<String, Entry<Result>> tickets = new ConcurrentHashMap<>();

    public String newState() {
        cleanUp();
        String s = random();
        states.put(s, new Entry<>(true, Instant.now().plus(STATE_TTL)));
        return s;
    }

    /** 카카오가 돌려준 state가 우리가 만든 것인지(한 번만 사용) */
    public boolean useState(String state) {
        if (state == null) {
            return false;
        }
        Entry<Boolean> e = states.remove(state);
        return e != null && Instant.now().isBefore(e.expiresAt());
    }

    public String ticket(Result result) {
        cleanUp();
        String t = random();
        tickets.put(t, new Entry<>(result, Instant.now().plus(TICKET_TTL)));
        return t;
    }

    /** 티켓으로 결과 받기(한 번만). 실패 결과였으면 그 오류를 그대로 돌려준다 */
    public Object redeem(String ticket) {
        Entry<Result> e = ticket == null ? null : tickets.remove(ticket.trim());
        if (e == null || Instant.now().isAfter(e.expiresAt())) {
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
        if (states.size() > 1_000) {
            states.values().removeIf(x -> now.isAfter(x.expiresAt()));
        }
        if (tickets.size() > 1_000) {
            tickets.values().removeIf(x -> now.isAfter(x.expiresAt()));
        }
    }

    private static String random() {
        byte[] b = new byte[24];
        RANDOM.nextBytes(b);
        return HexFormat.of().formatHex(b);
    }
}
