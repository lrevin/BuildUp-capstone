-- 모바일 앱 데이터 구조를 반영하고 기존 보고 첨부 테이블에 S3 메타데이터 저장 구조를 준비한다.
-- report_checks는 검사 결과를 보존하며, S3 URL·버킷·인증정보 대신 변경되지 않는 s3_key만 저장한다.

ALTER TABLE sites
    ADD COLUMN work_type VARCHAR(100) NULL AFTER address,
    ADD COLUMN latitude DECIMAL(10, 7) NULL AFTER company_id,
    ADD COLUMN longitude DECIMAL(10, 7) NULL AFTER latitude;

ALTER TABLE reports
    MODIFY COLUMN process_key VARCHAR(50) NULL,
    MODIFY COLUMN process_name VARCHAR(100) NULL,
    ADD COLUMN work VARCHAR(500) NULL AFTER process_name,
    ADD COLUMN submit_latitude DECIMAL(10, 7) NULL AFTER equipment,
    ADD COLUMN submit_longitude DECIMAL(10, 7) NULL AFTER submit_latitude,
    ADD COLUMN submit_accuracy DECIMAL(10, 2) NULL AFTER submit_longitude;

UPDATE reports
SET work = process_name
WHERE work IS NULL;

ALTER TABLE material_requests
    MODIFY COLUMN process_key VARCHAR(50) NULL,
    MODIFY COLUMN process_name VARCHAR(100) NULL;

-- 기존 API가 사용하는 file_name과 path는 S3 연동이 완료될 때까지 호환용으로 유지한다.
ALTER TABLE report_photos
    ADD COLUMN id BIGINT NOT NULL AUTO_INCREMENT FIRST,
    ADD COLUMN s3_key VARCHAR(500) NULL AFTER file_name,
    ADD COLUMN original_name VARCHAR(255) NULL AFTER s3_key,
    ADD COLUMN content_type VARCHAR(100) NULL AFTER original_name,
    ADD COLUMN size_bytes BIGINT NULL AFTER content_type,
    ADD COLUMN taken_at DATETIME(6) NULL AFTER size_bytes,
    ADD COLUMN latitude DECIMAL(10, 7) NULL AFTER taken_at,
    ADD COLUMN longitude DECIMAL(10, 7) NULL AFTER latitude,
    ADD COLUMN created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) AFTER longitude,
    ADD CONSTRAINT pk_report_photos PRIMARY KEY (id),
    ADD CONSTRAINT uq_report_photos_s3_key UNIQUE (s3_key);

UPDATE report_photos
SET original_name = file_name
WHERE original_name IS NULL;

ALTER TABLE report_files
    ADD COLUMN id BIGINT NOT NULL AUTO_INCREMENT FIRST,
    ADD COLUMN s3_key VARCHAR(500) NULL AFTER path,
    ADD COLUMN content_type VARCHAR(100) NULL AFTER original_name,
    ADD COLUMN created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) AFTER size_bytes,
    ADD CONSTRAINT pk_report_files PRIMARY KEY (id),
    ADD CONSTRAINT uq_report_files_s3_key UNIQUE (s3_key);

CREATE TABLE report_checks (
    id BIGINT NOT NULL AUTO_INCREMENT,
    report_id BIGINT NOT NULL,
    position INT NOT NULL,
    check_type VARCHAR(30) NOT NULL,
    message VARCHAR(500) NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_report_checks PRIMARY KEY (id),
    CONSTRAINT uq_report_checks_report_position UNIQUE (report_id, position),
    CONSTRAINT fk_report_checks_report
        FOREIGN KEY (report_id) REFERENCES reports (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
