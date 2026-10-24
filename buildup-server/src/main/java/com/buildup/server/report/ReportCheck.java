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

/**
 * 보고를 제출할 때 찾은 확인 결과 (DB 설계 V11 `report_checks`)
 * check_type: old_photo(오래된 사진) | far_submit(현장 밖 제출) | far_photo(현장 밖에서 찍은 사진) | no_location(위치 없음)
 */
@Entity
@Table(name = "report_checks")
@Getter
@NoArgsConstructor
public class ReportCheck {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "report_id")
    private Report report;

    /** 특정 사진에 관한 결과면 그 사진(지금은 사진 여러 장을 묶어 알려 주므로 비워 둔다) */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "photo_id")
    private ReportPhoto photo;

    @Column(nullable = false)
    private int position;

    @Column(name = "check_type", nullable = false, length = 30)
    private String checkType;

    @Column(nullable = false, length = 500)
    private String message;

    @Column(nullable = false, columnDefinition = "datetime(6)")
    private Instant createdAt = Instant.now();

    public ReportCheck(Report report, int position, String checkType, String message) {
        this.report = report;
        this.position = position;
        this.checkType = checkType;
        this.message = message;
    }
}
