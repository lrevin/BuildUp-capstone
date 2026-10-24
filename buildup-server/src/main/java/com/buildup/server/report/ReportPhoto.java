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
 * 보고 사진 1장 + 촬영 정보 (DB 설계 V11 `report_photos`)
 * s3_key: 저장소 안의 파일 위치(서버 폴더 저장일 때도 같은 칸에 저장 위치를 둔다)
 */
@Entity
@Table(name = "report_photos")
@Getter
@Setter
@NoArgsConstructor
public class ReportPhoto {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "report_id")
    private Report report;

    @Column(nullable = false)
    private int position;

    @Column(name = "s3_key", unique = true, length = 500)
    private String key;

    @Column(name = "original_name", nullable = false, length = 255)
    private String originalName;

    @Column(name = "content_type", length = 100)
    private String contentType;

    @Column(name = "size_bytes")
    private Long sizeBytes;

    /** 촬영 시각(사진 EXIF 또는 앱이 알려 준 값) */
    @Column(name = "taken_at", columnDefinition = "datetime(6)")
    private Instant takenAt;

    /** 촬영 위치(사진 EXIF의 GPS) */
    @Column(columnDefinition = "decimal(10,7)")
    private Double latitude;

    @Column(columnDefinition = "decimal(10,7)")
    private Double longitude;

    @Column(nullable = false, columnDefinition = "datetime(6)")
    private Instant createdAt = Instant.now();

    public ReportPhoto(String key, String originalName, String contentType, Long sizeBytes,
            Instant takenAt, Double latitude, Double longitude) {
        this.key = key;
        this.originalName = originalName;
        this.contentType = contentType;
        this.sizeBytes = sizeBytes;
        this.takenAt = takenAt;
        this.latitude = latitude;
        this.longitude = longitude;
    }
}
