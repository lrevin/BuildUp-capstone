package com.buildup.server.user;

/** 현장 총관리자 / 일반 작업자 / 본사 관계자. 앱과 주고받을 때는 소문자('admin', 'worker', 'hq'). */
public enum Role {
    ADMIN,
    WORKER,
    HQ;

    public String api() {
        return name().toLowerCase();
    }

    public static Role fromApi(String value) {
        return switch (value == null ? "" : value) {
            case "admin" -> ADMIN;
            case "hq" -> HQ;
            default -> WORKER;
        };
    }
}
