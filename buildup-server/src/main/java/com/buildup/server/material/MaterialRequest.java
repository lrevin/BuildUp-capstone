package com.buildup.server.material;

import com.buildup.server.site.Site;
import com.buildup.server.user.User;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OrderColumn;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * 자재 요청 1건. 흐름: requested(요청) → approved(승인) / rejected(반려)
 * 현장 총관리자나 연결된 본사의 관계자가 승인·반려한다.
 */
@Entity
@Table(name = "material_requests", indexes = @Index(columnList = "site_id, createdAt"))
@Getter
@Setter
@NoArgsConstructor
public class MaterialRequest {

    public static final String REQUESTED = "requested";
    public static final String APPROVED = "approved";
    public static final String REJECTED = "rejected";
    /** 예전 버전(발주·입고 단계가 있던 때)의 상태. 서버 시작 시 승인으로 바꾼다. */
    public static final String LEGACY_ORDERED = "ordered";
    public static final String LEGACY_DELIVERED = "delivered";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "site_id")
    private Site site;

    /** 관련 공정(없으면 현장 공통) */
    @Column(name = "process_key", length = 20)
    private String processKey;

    @Column(length = 30)
    private String processName;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "material_request_items", joinColumns = @JoinColumn(name = "request_id"))
    @OrderColumn(name = "position")
    private List<MaterialItem> items = new ArrayList<>();

    /** 현장에 필요한 날짜(선택) */
    private LocalDate neededBy;

    @Column(nullable = false)
    private boolean urgent;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String note = "";

    @Column(nullable = false, length = 20)
    private String status = REQUESTED;

    @Column(length = 100)
    private String rejectReason;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "author_id")
    private User author;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    /** 처리 이력(오래된 순) */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "material_request_events", joinColumns = @JoinColumn(name = "request_id"))
    @OrderColumn(name = "position")
    private List<MaterialEvent> events = new ArrayList<>();

    public void addEvent(String status, User actor, boolean byHq, Instant at) {
        events.add(new MaterialEvent(status, actor.getName(), byHq, at));
    }
}
