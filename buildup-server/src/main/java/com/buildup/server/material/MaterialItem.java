package com.buildup.server.material;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 요청한 자재 한 줄: 이름 · 수량 · 단위 */
@Embeddable
@Getter
@NoArgsConstructor
@AllArgsConstructor
public class MaterialItem {

    @Column(nullable = false, length = 50)
    private String name;

    @Column(nullable = false)
    private double quantity;

    @Column(nullable = false, length = 10)
    private String unit;
}
