ALTER TABLE reports
    ADD COLUMN review_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' AFTER author_id;

UPDATE reports
SET review_status = 'APPROVED';

CREATE TABLE report_review_events (
    id BIGINT NOT NULL AUTO_INCREMENT,
    report_id BIGINT NOT NULL,
    reviewer_id BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL,
    comment TEXT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_report_review_events PRIMARY KEY (id),
    CONSTRAINT fk_report_review_events_report
        FOREIGN KEY (report_id) REFERENCES reports (id),
    CONSTRAINT fk_report_review_events_reviewer
        FOREIGN KEY (reviewer_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
