package com.buildup.server.hq;

import java.util.List;

/** 본사 화면 응답 모양(앱 src/types.ts의 HqInfo와 같음) */
public final class HqDtos {

    private HqDtos() {}

    /** 본사 정보: 이름, 본사 코드, 연결 현장 수, 본사 관계자 이름 */
    public record HqInfoDto(String name, String code, int siteCount, List<String> staff) {}
}
