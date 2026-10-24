package com.buildup.server.report;

import com.buildup.server.user.User;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
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

/** 보고 검토 이력 한 줄: 누가 언제 승인·보완 요청했는지 (DB 설계 V11 `report_review_events`) */
@Entity
@Table(name = "report_review_events")
@Getter
@NoArgsConstructor
public class ReportReviewEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "report_id")
    private Report report;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "reviewer_id")
    private User reviewer;

    /** approved | revision (DB에는 대문자) */
    @Convert(converter = ReviewStatusConverter.class)
    @Column(nullable = false, length = 20)
    private String status;

    @Column(columnDefinition = "text")
    private String comment;

    @Column(nullable = false, columnDefinition = "datetime(6)")
    private Instant createdAt = Instant.now();

    public ReportReviewEvent(Report report, User reviewer, String status, String comment, Instant at) {
        this.report = report;
        this.reviewer = reviewer;
        this.status = status;
        this.comment = comment;
        this.createdAt = at;
    }
}
