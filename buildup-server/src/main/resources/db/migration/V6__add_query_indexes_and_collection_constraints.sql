ALTER TABLE report_photos
    ADD CONSTRAINT uq_report_photos_report_position UNIQUE (report_id, position);

ALTER TABLE report_files
    ADD CONSTRAINT uq_report_files_report_position UNIQUE (report_id, position);

ALTER TABLE material_request_items
    ADD CONSTRAINT uq_material_request_items_request_position UNIQUE (request_id, position);

ALTER TABLE material_request_events
    ADD CONSTRAINT uq_material_request_events_request_position UNIQUE (request_id, position);

CREATE INDEX idx_site_members_user_site
    ON site_members (user_id, site_id);

CREATE INDEX idx_reports_site_created_id
    ON reports (site_id, created_at, id);

CREATE INDEX idx_reports_site_process_created_id
    ON reports (site_id, process_key, created_at, id);

CREATE INDEX idx_material_requests_site_created_id
    ON material_requests (site_id, created_at, id);

CREATE INDEX idx_material_requests_site_status
    ON material_requests (site_id, status);

CREATE INDEX idx_refresh_tokens_user_revoked_expires
    ON refresh_tokens (user_id, revoked_at, expires_at);
