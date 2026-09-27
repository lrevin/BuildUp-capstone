package com.buildup.server.report;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 보고에 첨부한 문서 파일(엑셀·PDF·한글 등) 한 개 */
@Embeddable
@Getter
@NoArgsConstructor
@AllArgsConstructor
public class ReportFile {

    /** uploads 폴더 기준 저장 위치(docs/무작위이름/원래파일이름) */
    @Column(name = "path", nullable = false, length = 300)
    private String path;

    /** 올린 사람이 보던 원래 파일 이름 */
    @Column(name = "original_name", nullable = false, length = 200)
    private String name;

    @Column(name = "size_bytes", nullable = false)
    private long size;
}
