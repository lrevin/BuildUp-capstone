package com.buildup.server.report;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * 보고에 첨부한 문서 파일(엑셀·PDF·한글 등) 한 개 (DB 설계 V11 `report_files`)
 * 저장 위치는 s3_key 칸에 둔다(path는 예전 데이터용)
 */
@Entity
@Table(name = "report_files")
@Getter
@Setter
@NoArgsConstructor
public class ReportFile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "report_id")
    private Report report;

    @Column(nullable = false)
    private int position;

    @Column(length = 500)
    private String path;

    @Column(name = "s3_key", unique = true, length = 500)
    private String s3Key;

    /** 올린 사람이 보던 원래 파일 이름 */
    @Column(name = "original_name", nullable = false, length = 255)
    private String name;

    @Column(name = "content_type", length = 100)
    private String contentType;

    @Column(name = "size_bytes", nullable = false)
    private long size;

    @Column(nullable = false, columnDefinition = "datetime(6)")
    private Instant createdAt = Instant.now();

    public ReportFile(String key, String name, String contentType, long size) {
        this.s3Key = key;
        this.name = name;
        this.contentType = contentType;
        this.size = size;
    }

    /** 저장소 안의 위치 */
    public String key() {
        return s3Key != null ? s3Key : path;
    }
}
