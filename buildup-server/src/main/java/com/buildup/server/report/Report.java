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

    /** 보고 전 진행률 → 보고 후 진행률 */
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

    /** 업로드한 사진 파일 이름(uploads 폴더 기준) */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "report_photos", joinColumns = @JoinColumn(name = "report_id"))
    @OrderColumn(name = "position")
    @Column(name = "file_name", nullable = false, length = 100)
    private List<String> photos = new ArrayList<>();

    /** 첨부 문서(엑셀·PDF·한글 등) */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "report_files", joinColumns = @JoinColumn(name = "report_id"))
    @OrderColumn(name = "position")
    private List<ReportFile> files = new ArrayList<>();
}
