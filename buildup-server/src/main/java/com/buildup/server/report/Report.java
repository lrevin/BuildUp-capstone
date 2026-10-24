package com.buildup.server.report;

import com.buildup.server.site.Site;
import com.buildup.server.user.User;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * 진척 보고 1건 (DB 설계 V11 `reports`)
 * - 직접 입력 현장: process_key·process_name 없음, from/to = 현장 전체 진행률
 * - 자동 계산 현장: process_key·process_name = 보고한 공정, from/to = 그 공정의 진행률
 *   (현장 전체 진행률 변화는 공정 가중치로 다시 계산해서 보여 준다)
 */
@Entity
@Table(name = "reports")
@Getter
@Setter
@NoArgsConstructor
public class Report {

    /** 검토 상태(API 값): 대기 → 승인 / 보완 요청(작성자가 메모를 고치면 다시 대기). DB에는 대문자로 저장 */
    public static final String PENDING = "pending";
    public static final String APPROVED = "approved";
    public static final String REVISION = "revision";

    /** 직접 입력 보고를 API에서 부르는 공정 이름(예전 앱 호환) */
    public static final String WORK_KEY = "work";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "site_id")
    private Site site;

    @Column(name = "process_key", length = 50)
    private String processKey;

    @Column(name = "process_name", length = 100)
    private String processName;

    /** 진행한 작업(보고하는 사람이 직접 입력, 자동 계산 현장은 비우면 '공정명 작업') */
    @Column(nullable = false, length = 500)
    private String work;

    /** 보고 전 → 후 진행률(직접 입력: 현장 전체, 자동 계산: 보고한 공정) */
    @Column(name = "from_progress", nullable = false, columnDefinition = "decimal(5,2)")
    private double fromProgress;

    @Column(name = "to_progress", nullable = false, columnDefinition = "decimal(5,2)")
    private double toProgress;

    @Column(columnDefinition = "text")
    private String memo = "";

    // ---- 작업일보 항목(예전 보고만, 지금은 받지 않음) ----
    @Column(length = 100)
    private String weather;

    private Integer workers;

    @Column(columnDefinition = "text")
    private String equipment = "";

    // ---- 제출 위치(보고를 제출할 때 휴대폰 GPS). 위치 권한을 안 주면 없음 ----
    @Column(name = "submit_latitude", columnDefinition = "decimal(10,7)")
    private Double latitude;

    @Column(name = "submit_longitude", columnDefinition = "decimal(10,7)")
    private Double longitude;

    /** GPS 오차(m) */
    @Column(name = "submit_accuracy", columnDefinition = "decimal(10,2)")
    private Double accuracy;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "author_id")
    private User author;

    /** 검토 상태(pending | approved | revision). 코멘트·검토한 사람은 reviewEvents */
    @Convert(converter = ReviewStatusConverter.class)
    @Column(name = "review_status", nullable = false, length = 20)
    private String reviewStatus = PENDING;

    @Column(nullable = false, columnDefinition = "datetime(6)")
    private Instant createdAt = Instant.now();

    /** 마지막으로 고친 시각(처음에는 만든 시각과 같다) */
    @Column(nullable = false, columnDefinition = "datetime(6)")
    private Instant updatedAt = createdAt;

    @OneToMany(mappedBy = "report", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("position ASC")
    private List<ReportPhoto> photos = new ArrayList<>();

    /** 첨부 문서(엑셀·PDF·한글 등) */
    @OneToMany(mappedBy = "report", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("position ASC")
    private List<ReportFile> files = new ArrayList<>();

    /** 검토 이력(승인·보완 요청) */
    @OneToMany(mappedBy = "report", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("createdAt ASC, id ASC")
    private List<ReportReviewEvent> reviewEvents = new ArrayList<>();

    /** 제출할 때 찾은 확인 결과(오래된 사진, 현장 밖 제출 등) */
    @OneToMany(mappedBy = "report", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("position ASC")
    private List<ReportCheck> checks = new ArrayList<>();

    public String workText() {
        return work != null && !work.isBlank() ? work : processName;
    }

    /** 자동 계산 현장에서 공정을 골라 올린 보고인가 */
    public boolean isProcessReport() {
        return processKey != null;
    }

    public String status() {
        return reviewStatus == null ? APPROVED : reviewStatus;
    }

    /** 메모를 고쳤는가(만든 뒤 1초 넘게 지나서 바뀌었으면) */
    public Instant editedAt() {
        return updatedAt != null && Duration.between(createdAt, updatedAt).getSeconds() >= 1 ? updatedAt : null;
    }

    public List<String> photoFiles() {
        return photos.stream().map(ReportPhoto::getKey).toList();
    }

    public void addPhoto(ReportPhoto p) {
        p.setReport(this);
        p.setPosition(photos.size());
        photos.add(p);
    }

    public void addFile(ReportFile f) {
        f.setReport(this);
        f.setPosition(files.size());
        files.add(f);
    }

    public void addCheck(String type, String message) {
        checks.add(new ReportCheck(this, checks.size(), type, message));
    }

    /** 가장 최근 검토(없으면 null) */
    public ReportReviewEvent lastReview() {
        return reviewEvents.isEmpty() ? null : reviewEvents.get(reviewEvents.size() - 1);
    }

    public void addReview(User reviewer, String status, String comment, Instant at) {
        reviewEvents.add(new ReportReviewEvent(this, reviewer, status, comment, at));
        reviewStatus = status;
    }
}
