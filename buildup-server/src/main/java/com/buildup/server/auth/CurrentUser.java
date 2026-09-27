package com.buildup.server.auth;

import com.buildup.server.common.ApiException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/** 현재 요청을 보낸 사용자 id */
public final class CurrentUser {

    private CurrentUser() {}

    public static Long id() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof Long id)) {
            throw ApiException.unauthorized("로그인이 필요합니다.");
        }
        return id;
    }
}
