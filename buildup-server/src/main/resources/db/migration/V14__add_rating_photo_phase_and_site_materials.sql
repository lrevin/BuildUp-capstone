-- CBT 의견 반영
-- 1) 보고 평점: 현장 관리자가 그날 작업을 0.5 ~ 5.0점(소수점 한 자리)으로 매긴다(선택)
-- 2) 보고 사진을 작업 전 / 작업 후로 나눈다(예전 사진은 구분 없음 = NULL)
-- 3) 현장 자재 재고: 현장을 만들 때 최고 책임자가 지금 있는 자재 양을 넣는다
-- 4) 보고별 오늘 사용한 자재: 보고가 승인되면 현장 자재 재고에서 뺀다(applied_at = 뺀 시각)

ALTER TABLE reports
    ADD COLUMN rating DECIMAL(2,1) NULL AFTER memo,
    ADD COLUMN materials_applied_at DATETIME(6) NULL AFTER rating,
    ADD CONSTRAINT ck_reports_rating CHECK (rating IS NULL OR (rating >= 0.5 AND rating <= 5.0));

ALTER TABLE report_photos
    ADD COLUMN phase VARCHAR(10) NULL AFTER position;

CREATE TABLE site_materials (
    id BIGINT NOT NULL AUTO_INCREMENT,
    site_id BIGINT NOT NULL,
    position INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    quantity DECIMAL(15,3) NOT NULL,
    unit VARCHAR(30) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    CONSTRAINT pk_site_materials PRIMARY KEY (id),
    CONSTRAINT uk_site_materials_name_unit UNIQUE (site_id, name, unit),
    CONSTRAINT fk_site_materials_site
        FOREIGN KEY (site_id) REFERENCES sites (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE report_material_usages (
    report_id BIGINT NOT NULL,
    position INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    quantity DECIMAL(15,3) NOT NULL,
    unit VARCHAR(30) NOT NULL,
    CONSTRAINT pk_report_material_usages PRIMARY KEY (report_id, position),
    CONSTRAINT fk_report_material_usages_report
        FOREIGN KEY (report_id) REFERENCES reports (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
