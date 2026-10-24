-- 기존 V11~V16의 시행착오를 정리해 최종적으로 필요한 스키마 변경만 한 번에 적용한다.
-- 팀 공유 V10(REJECTED -> REVISION)을 기준으로 하며, 서비스에서 다룰 업무 규칙은 과도하게 DB에 고정하지 않는다.

-- 레거시 회사 소속을 정규화된 멤버십으로 이전한다.
INSERT INTO company_memberships (company_id, user_id, role, status)
SELECT hq_company_id, id, 'HQ_MEMBER', 'ACTIVE'
FROM users
WHERE hq_company_id IS NOT NULL
ON DUPLICATE KEY UPDATE status = 'ACTIVE';

INSERT INTO company_memberships (company_id, user_id, role, status)
SELECT manager_company_id, id, 'HQ_MANAGER', 'ACTIVE'
FROM users
WHERE manager_company_id IS NOT NULL
ON DUPLICATE KEY UPDATE role = 'HQ_MANAGER', status = 'ACTIVE';

-- V9에서 준비한 사진 원본명과 보고서 작업 내용을 가능한 범위에서 보정한다.
UPDATE report_photos
SET original_name = file_name
WHERE original_name IS NULL;

UPDATE reports
SET work = TRIM(process_name)
WHERE (work IS NULL OR TRIM(work) = '')
  AND process_name IS NOT NULL
  AND TRIM(process_name) <> '';

-- 자재 요청 상태는 API와 DB 모두 소문자를 표준값으로 사용한다.
-- V1~V10에서 저장된 대문자 또는 혼합 표기 데이터는 검증 전에 정규화한다.
UPDATE material_requests
SET status = LOWER(TRIM(status))
WHERE UPPER(TRIM(status)) IN ('REQUESTED', 'APPROVED', 'REJECTED', 'ORDERED', 'DELIVERED');

UPDATE material_request_events
SET status = LOWER(TRIM(status))
WHERE UPPER(TRIM(status)) IN ('REQUESTED', 'APPROVED', 'REJECTED', 'ORDERED', 'DELIVERED');

-- 삭제·NOT NULL·CHECK 적용 전에 기존 데이터가 최종 규칙을 만족하는지 한 번에 검증한다.
CREATE TEMPORARY TABLE v11_schema_guard (
    issue_count BIGINT NOT NULL,
    CONSTRAINT chk_v11_schema_ready CHECK (issue_count = 0)
);

INSERT INTO v11_schema_guard (issue_count)
SELECT
    (SELECT COUNT(*)
     FROM users
     WHERE company IS NOT NULL
       AND TRIM(company) <> '')
    +
    (SELECT COUNT(*)
     FROM users u
     WHERE u.hq_company_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
           FROM company_memberships cm
           WHERE cm.user_id = u.id
             AND cm.company_id = u.hq_company_id
       ))
    +
    (SELECT COUNT(*)
     FROM users u
     WHERE u.manager_company_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
           FROM company_memberships cm
           WHERE cm.user_id = u.id
             AND cm.company_id = u.manager_company_id
             AND cm.role = 'HQ_MANAGER'
       ))
    +
    (SELECT COUNT(*)
     FROM report_photos
     WHERE original_name IS NULL
        OR (size_bytes IS NOT NULL AND size_bytes < 0)
        OR ((latitude IS NULL) <> (longitude IS NULL))
        OR (latitude IS NOT NULL AND latitude NOT BETWEEN -90 AND 90)
        OR (longitude IS NOT NULL AND longitude NOT BETWEEN -180 AND 180))
    +
    (SELECT COUNT(*)
     FROM report_files
     WHERE (path IS NULL AND s3_key IS NULL)
        OR size_bytes < 0)
    +
    (SELECT COUNT(*)
     FROM sites
     WHERE ((latitude IS NULL) <> (longitude IS NULL))
        OR (latitude IS NOT NULL AND latitude NOT BETWEEN -90 AND 90)
        OR (longitude IS NOT NULL AND longitude NOT BETWEEN -180 AND 180))
    +
    (SELECT COUNT(*)
     FROM site_processes
     WHERE weight <= 0 OR weight > 100
        OR progress < 0 OR progress > 100
        OR sort_order < 0)
    +
    (SELECT COUNT(*)
     FROM reports
     WHERE work IS NULL OR TRIM(work) = ''
        OR ((process_key IS NULL) <> (process_name IS NULL))
        OR from_progress < 0 OR from_progress > 100
        OR to_progress < 0 OR to_progress > 100
        OR (workers IS NOT NULL AND workers < 0)
        OR ((submit_latitude IS NULL) <> (submit_longitude IS NULL))
        OR (submit_latitude IS NOT NULL AND submit_latitude NOT BETWEEN -90 AND 90)
        OR (submit_longitude IS NOT NULL AND submit_longitude NOT BETWEEN -180 AND 180)
        OR (submit_accuracy IS NOT NULL AND submit_accuracy < 0))
    +
    (SELECT COUNT(*)
     FROM material_requests request
     WHERE ((request.process_key IS NULL) <> (request.process_name IS NULL))
        OR CAST(request.status AS BINARY) NOT IN ('requested', 'approved', 'rejected', 'ordered', 'delivered')
        OR NOT EXISTS (
            SELECT 1
            FROM material_request_items item
            WHERE item.request_id = request.id
        )
        OR NOT EXISTS (
            SELECT 1
            FROM material_request_events event
            WHERE event.request_id = request.id
        )
        OR request.status <> (
            SELECT event.status
            FROM material_request_events event
            WHERE event.request_id = request.id
            ORDER BY event.position DESC
            LIMIT 1
        ))
    +
    (SELECT COUNT(*)
     FROM material_request_items
     WHERE quantity <= 0 OR position < 0)
    +
    (SELECT COUNT(*)
     FROM material_request_events
     WHERE actor_user_id IS NULL
        OR position < 0
        OR CAST(status AS BINARY) NOT IN ('requested', 'approved', 'rejected', 'ordered', 'delivered'))
    +
    (SELECT COUNT(*)
     FROM notifications
     WHERE (reference_type IS NULL) <> (reference_id IS NULL));

DROP TEMPORARY TABLE v11_schema_guard;

-- 더 이상 사용하지 않는 인증·회사 소속 레거시 구조를 제거한다.
DROP TABLE IF EXISTS legacy_auth_tokens;

ALTER TABLE users
    DROP FOREIGN KEY fk_users_hq_company,
    DROP FOREIGN KEY fk_users_manager_company,
    DROP COLUMN company,
    DROP COLUMN hq_company_id,
    DROP COLUMN manager_company_id;

-- 사진과 일반 첨부파일을 현재 S3 엔티티 구조에 맞춘다.
ALTER TABLE report_photos
    MODIFY COLUMN original_name VARCHAR(255) NOT NULL,
    DROP COLUMN file_name,
    ADD CONSTRAINT chk_report_photos_size
        CHECK (size_bytes IS NULL OR size_bytes >= 0),
    ADD CONSTRAINT chk_report_photos_location_pair
        CHECK ((latitude IS NULL) = (longitude IS NULL)),
    ADD CONSTRAINT chk_report_photos_latitude
        CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    ADD CONSTRAINT chk_report_photos_longitude
        CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180);

ALTER TABLE report_files
    MODIFY COLUMN path VARCHAR(500) NULL,
    ADD CONSTRAINT chk_report_files_storage_reference
        CHECK (path IS NOT NULL OR s3_key IS NOT NULL),
    ADD CONSTRAINT chk_report_files_size
        CHECK (size_bytes >= 0);

ALTER TABLE report_checks
    ADD COLUMN photo_id BIGINT NULL AFTER report_id,
    ADD CONSTRAINT fk_report_checks_photo
        FOREIGN KEY (photo_id) REFERENCES report_photos (id) ON DELETE CASCADE;

CREATE INDEX idx_report_checks_photo
    ON report_checks (photo_id);

-- 현장 좌표와 두 가지 진행률 계산 방식을 지원한다.
ALTER TABLE sites
    ADD COLUMN progress_calculation_mode VARCHAR(30) NOT NULL DEFAULT 'PROCESS_WEIGHTED',
    ADD CONSTRAINT chk_sites_progress_calculation_mode
        CHECK (progress_calculation_mode IN ('PROCESS_WEIGHTED', 'MANUAL_INPUT')),
    ADD CONSTRAINT chk_sites_location_pair
        CHECK ((latitude IS NULL) = (longitude IS NULL)),
    ADD CONSTRAINT chk_sites_latitude
        CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    ADD CONSTRAINT chk_sites_longitude
        CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180);

ALTER TABLE site_processes
    ADD CONSTRAINT chk_site_processes_weight
        CHECK (weight > 0 AND weight <= 100),
    ADD CONSTRAINT chk_site_processes_progress
        CHECK (progress >= 0 AND progress <= 100),
    ADD CONSTRAINT chk_site_processes_sort_order
        CHECK (sort_order >= 0);

-- 보고서의 실제 작업 내용은 필수이며, 공정 키와 당시 공정명은 함께 있거나 함께 비운다.
ALTER TABLE reports
    MODIFY COLUMN work VARCHAR(500) NOT NULL,
    ADD CONSTRAINT chk_reports_work_not_blank
        CHECK (CHAR_LENGTH(TRIM(work)) > 0),
    ADD CONSTRAINT chk_reports_process_pair
        CHECK ((process_key IS NULL) = (process_name IS NULL)),
    ADD CONSTRAINT chk_reports_from_progress
        CHECK (from_progress >= 0 AND from_progress <= 100),
    ADD CONSTRAINT chk_reports_to_progress
        CHECK (to_progress >= 0 AND to_progress <= 100),
    ADD CONSTRAINT chk_reports_workers
        CHECK (workers IS NULL OR workers >= 0),
    ADD CONSTRAINT chk_reports_submit_location_pair
        CHECK ((submit_latitude IS NULL) = (submit_longitude IS NULL)),
    ADD CONSTRAINT chk_reports_submit_latitude
        CHECK (submit_latitude IS NULL OR submit_latitude BETWEEN -90 AND 90),
    ADD CONSTRAINT chk_reports_submit_longitude
        CHECK (submit_longitude IS NULL OR submit_longitude BETWEEN -180 AND 180),
    ADD CONSTRAINT chk_reports_submit_accuracy
        CHECK (submit_accuracy IS NULL OR submit_accuracy >= 0);

-- 자재 요청의 명확한 값 범위와 상태값만 DB가 보장한다.
ALTER TABLE material_requests
    ADD CONSTRAINT chk_material_requests_status
        CHECK (CAST(status AS BINARY) IN ('requested', 'approved', 'rejected', 'ordered', 'delivered')),
    ADD CONSTRAINT chk_material_requests_process_pair
        CHECK ((process_key IS NULL) = (process_name IS NULL));

ALTER TABLE material_request_items
    ADD CONSTRAINT chk_material_request_items_quantity
        CHECK (quantity > 0),
    ADD CONSTRAINT chk_material_request_items_position
        CHECK (position >= 0);

-- MySQL에서는 같은 이름의 외래키 제거와 재생성을 한 ALTER 문장에 함께 둘 수 없다.
ALTER TABLE material_request_events
    DROP FOREIGN KEY fk_material_request_events_actor_user;

ALTER TABLE material_request_events
    MODIFY COLUMN actor_user_id BIGINT NOT NULL,
    ADD CONSTRAINT chk_material_request_events_position
        CHECK (position >= 0),
    ADD CONSTRAINT chk_material_request_events_status
        CHECK (CAST(status AS BINARY) IN ('requested', 'approved', 'rejected', 'ordered', 'delivered')),
    ADD CONSTRAINT fk_material_request_events_actor_user
        FOREIGN KEY (actor_user_id) REFERENCES users (id);

ALTER TABLE notifications
    ADD CONSTRAINT chk_notifications_reference_pair
        CHECK ((reference_type IS NULL) = (reference_id IS NULL));
