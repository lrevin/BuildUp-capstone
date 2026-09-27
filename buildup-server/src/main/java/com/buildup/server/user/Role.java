package com.buildup.server.user;

/**
 * 현장 총관리자 / 일반 작업자 / 본사 관계자 / 시스템 관리자. 앱과 주고받을 때는 소문자('admin', 'worker', 'hq', 'system').
 * 시스템 관리자는 가입으로 만들 수 없다(서버 설정 SYSTEM_ADMIN_EMAIL로만 만든다).
 */
public enum Role {
    ADMIN,
    WORKER,
    HQ,
    SYSTEM;

    public String api() {
        return name().toLowerCase();
    }

    public static Role fromApi(String value) {
        return switch (value == null ? "" : value) {
            case "admin" -> ADMIN;
            case "hq" -> HQ;
            case "system" -> SYSTEM;
            default -> WORKER;
        };
    }
}
