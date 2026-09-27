package com.buildup.server.push;

import com.buildup.server.auth.CurrentUser;
import com.buildup.server.common.ApiException;
import com.buildup.server.user.UserRepository;
import java.time.Instant;
import java.util.Map;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** 앱이 로그인하면 이 휴대폰의 알림 주소를 등록하고, 로그아웃하면 지운다 */
@RestController
@Tag(name = "07 휴대폰 알림", description = "알림 받을 휴대폰 등록·삭제")
@RequiredArgsConstructor
public class PushController {

    /** 한 사람이 등록할 수 있는 휴대폰 수(오래된 것부터 정리하지 않고 거절) */
    static final int MAX_DEVICES = 10;

    private final DeviceTokenRepository devices;
    private final UserRepository users;

    public record TokenRequest(String token) {}

    @Operation(summary = "이 휴대폰을 알림 받을 곳으로 등록")
    @PostMapping("/api/push/token")
    @Transactional
    public Map<String, Boolean> register(@RequestBody TokenRequest req) {
        String token = clean(req);
        Long userId = CurrentUser.id();
        // 같은 휴대폰으로 다른 계정에 로그인하면 새 계정 것으로 옮긴다
        DeviceToken d = devices.findByToken(token).orElseGet(DeviceToken::new);
        boolean mine = d.getUser() != null && d.getUser().getId().equals(userId);
        if (!mine && devices.countByUserId(userId) >= MAX_DEVICES) {
            throw ApiException.badRequest("알림을 받을 휴대폰은 " + MAX_DEVICES + "대까지 등록할 수 있어요.");
        }
        d.setToken(token);
        d.setUser(users.getReferenceById(userId));
        d.setUpdatedAt(Instant.now());
        devices.save(d);
        return Map.of("ok", true);
    }

    @Operation(summary = "이 휴대폰 알림 등록 지우기(로그아웃 때)")
    @DeleteMapping("/api/push/token")
    @Transactional
    public Map<String, Boolean> unregister(@RequestBody TokenRequest req) {
        devices.deleteMine(clean(req), CurrentUser.id());
        return Map.of("ok", true);
    }

    private static String clean(TokenRequest req) {
        String t = req == null || req.token() == null ? "" : req.token().trim();
        if (t.isEmpty() || t.length() > 300) {
            throw ApiException.badRequest("알림 주소가 올바르지 않습니다.");
        }
        return t;
    }
}
