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
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * 현장 자재 재고 한 줄(DB 설계 V14 `site_materials`): 이름 · 남은 양 · 단위.
 * 현장을 만들 때 최고 책임자가 넣고, 보고가 승인되면 그 보고에서 쓴 양만큼 줄어든다.
 */
@Entity
@Table(name = "site_materials")
@Getter
@Setter
@NoArgsConstructor
public class SiteMaterial {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "site_id")
    private Site site;

    @Column(nullable = false)
    private int position;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false, columnDefinition = "decimal(15,3)")
    private double quantity;

    @Column(nullable = false, length = 30)
    private String unit;

    @Column(nullable = false, columnDefinition = "datetime(6)")
    private Instant updatedAt = Instant.now();

    public SiteMaterial(Site site, int position, String name, double quantity, String unit) {
        this.site = site;
        this.position = position;
        this.name = name;
        this.quantity = quantity;
        this.unit = unit;
    }

    /** 같은 자재인가(이름·단위, 띄어쓰기·대소문자 무시) */
    public boolean sameAs(String otherName, String otherUnit) {
        return key(name).equals(key(otherName)) && key(unit).equals(key(otherUnit));
    }

    public static String key(String s) {
        return s == null ? "" : s.replaceAll("\\s+", "").toLowerCase();
    }
}
