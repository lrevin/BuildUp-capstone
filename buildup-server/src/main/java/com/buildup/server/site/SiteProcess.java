package com.buildup.server.site;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;
import java.time.LocalDate;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 현장의 공정(골조·전기·설비·마감)과 현재 진행률, 공정 계획 */
@Entity
@Table(
        name = "site_processes",
        uniqueConstraints = @UniqueConstraint(columnNames = {"site_id", "process_key"}))
@Getter
@Setter
@NoArgsConstructor
public class SiteProcess {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "site_id")
    private Site site;

    /** 'frame' | 'electric' | 'plumbing' | 'finish' */
    @Column(name = "process_key", nullable = false, length = 20)
    private String key;

    @Column(nullable = false, length = 30)
    private String name;

    /** 전체 진행률 계산 비중(합계 1) */
    @Column(nullable = false)
    private double weight;

    /** 마지막으로 보고된 누적 진행률(%) */
    @Column(nullable = false)
    private double progress;

    private Instant lastReportedAt;

    /** 공정 계획: 시작일에 0%, 완료일에 100% */
    private LocalDate planStart;

    private LocalDate planEnd;

    @Column(nullable = false)
    private int sortOrder;

    public SiteProcess(Site site, String key, String name, double weight, int sortOrder) {
        this.site = site;
        this.key = key;
        this.name = name;
        this.weight = weight;
        this.sortOrder = sortOrder;
    }
}
