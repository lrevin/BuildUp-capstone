package com.buildup.server.common;

import java.time.Duration;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * 틀린 시도 횟수 제한(비밀번호, 6자리 참여 코드·본사 코드를 계속 넣어 보는 것을 막는다).
 * - 맞게 입력해도 기록을 지우지 않는다(아는 코드로 기록을 지우고 다시 대입하는 것 방지). 시간이 지나면 사라진다.
 * - 서버 메모리에만 기억하므로 서버를 다시 켜면 초기화된다(서버 1대 기준으로 충분).
 */
@Component
public class AttemptLimiter {

    private final Map<String, Deque<Long>> failures = new ConcurrentHashMap<>();

    /** 요청한 기기의 주소(https 앞단을 거치면 원래 주소, prod의 forward-headers 설정) */
    public static String clientIp() {
        var attrs = RequestContextHolder.getRequestAttributes();
        if (attrs instanceof ServletRequestAttributes s) {
            return s.getRequest().getRemoteAddr();
        }
        return "unknown";
    }

    /** 막혀 있으면 429(잠시 후 다시)로 거절 */
    public void check(String key, int max, Duration window, String what) {
        Deque<Long> q = failures.get(key);
        if (q == null) {
            return;
        }
        synchronized (q) {
            prune(q, window);
            if (q.isEmpty()) {
                failures.remove(key, q);
                return;
            }
            if (q.size() >= max) {
                long waitMs = q.peekFirst() + window.toMillis() - System.currentTimeMillis();
                long minutes = Math.max(1, (waitMs + 59_999) / 60_000);
                throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,
                        what + " 너무 많이 틀렸어요. " + minutes + "분 뒤에 다시 시도해 주세요.");
            }
        }
    }

    public void fail(String key) {
        Deque<Long> q = failures.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (q) {
            q.addLast(System.currentTimeMillis());
            while (q.size() > 50) {
                q.pollFirst();
            }
        }
        // 가끔 오래된 기록 정리(메모리가 계속 늘지 않게)
        if (failures.size() > 10_000) {
            failures.entrySet().removeIf(e -> {
                synchronized (e.getValue()) {
                    prune(e.getValue(), Duration.ofHours(1));
                    return e.getValue().isEmpty();
                }
            });
        }
    }

    public void clear(String key) {
        failures.remove(key);
    }

    private static void prune(Deque<Long> q, Duration window) {
        long from = System.currentTimeMillis() - window.toMillis();
        while (!q.isEmpty() && q.peekFirst() < from) {
            q.pollFirst();
        }
    }
}
