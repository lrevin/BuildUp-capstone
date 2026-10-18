package com.buildup.server.report;

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
import java.util.ArrayList;
import java.util.List;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 공정 진척 보고 1건 */
@Entity
@Table(name = "reports", indexes = @Index(columnList = "site_id, process_key, createdAt"))
@Getter
@Setter
@NoArgsConstructor
public class Report {

    /** 검토 상태: 대기 → 승인 / 보완 요청(작성자가 메모를 고치면 다시 대기) */
    public static final String PENDING = "pending";
    public static final String APPROVED = "approved";
    public static final String REVISION = "revision";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "site_id")
    private Site site;

    @Column(name = "process_key", nullable = false, length = 20)
    private String processKey;

    @Column(nullable = false, length = 30)
    private String processName;

    /** 진행한 작업(보고하는 사람이 직접 입력). 예전 보고는 null → processName을 쓴다 */
    @Column(length = 100)
    private String work;

    public String workText() {
        return work != null && !work.isBlank() ? work : processName;
    }

    /** 자동 계산 방식: 보고한 공정의 진행률(보고 전 → 후). 직접 입력 방식이면 null */
    private Double processFrom;

    private Double processTo;

    /** 보고 전 현장 전체 진행률 → 보고 후 진행률(직접 입력이면 보고하는 사람이 입력, 자동이면 계산값) */
    @Column(name = "from_progress", nullable = false)
    private double fromProgress;

    @Column(name = "to_progress", nullable = false)
    private double toProgress;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String memo = "";

    // ---- 작업일보 항목(선택) ----
    @Column(length = 10)
    private String weather; // sunny | cloudy | rain | snow

    private Integer workers;

    @Column(nullable = false, length = 200)
    private String equipment = "";

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "author_id")
    private User author;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    /** 메모를 고친 시각 */
    private Instant updatedAt;

    /** 업로드한 사진(uploads 폴더 기준 파일 이름 + 촬영 시각·위치) */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "report_photos", joinColumns = @JoinColumn(name = "report_id"))
    @OrderColumn(name = "position")
    private List<ReportPhoto> photos = new ArrayList<>();

    // ---- 제출 위치(보고를 제출할 때 휴대폰 GPS). 위치 권한을 안 주면 없음 ----
    private Double latitude;

    private Double longitude;

    /** GPS 오차(m) */
    private Double accuracy;

    // ---- 검토(본사 또는 현장 총관리자) ----
    /** null은 이 기능 전에 올라온 보고 → 승인으로 본다 */
    @Column(length = 10)
    private String reviewStatus = PENDING;

    @Column(length = 500)
    private String reviewComment;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reviewer_id")
    private User reviewer;

    private Instant reviewedAt;

    public String status() {
        return reviewStatus == null ? APPROVED : reviewStatus;
    }

    public List<String> photoFiles() {
        return photos.stream().map(ReportPhoto::getFileName).toList();
    }

    /** 첨부 문서(엑셀·PDF·한글 등) */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "report_files", joinColumns = @JoinColumn(name = "report_id"))
    @OrderColumn(name = "position")
    private List<ReportFile> files = new ArrayList<>();
}
