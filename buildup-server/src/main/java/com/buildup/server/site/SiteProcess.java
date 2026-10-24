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

/** 현장의 공정(예: 철거·설비·목공·마감)과 가중치, 공정별 현재 진행률 (자동 계산 방식) */
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

    /** 공정 구분값(현장 안에서 겹치지 않음). 예전 데모: frame·electric·plumbing·finish, 새 공정: p1, p2 … */
    @Column(name = "process_key", nullable = false, length = 50)
    private String key;

    @Column(nullable = false, length = 100)
    private String name;

    /** 가중치(%). 계산할 때 합계로 나누므로 예전 데이터(합계 1)도 그대로 쓴다 */
    @Column(nullable = false, columnDefinition = "decimal(5,2)")
    private double weight;

    /** 마지막으로 보고된 누적 진행률(%) */
    @Column(nullable = false, columnDefinition = "decimal(5,2)")
    private double progress;

    @Column(columnDefinition = "datetime(6)")
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
