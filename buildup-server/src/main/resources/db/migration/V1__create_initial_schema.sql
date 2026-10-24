CREATE TABLE companies (
    id BIGINT NOT NULL AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_companies PRIMARY KEY (id),
    CONSTRAINT uq_companies_code UNIQUE (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
    id BIGINT NOT NULL AUTO_INCREMENT,
    name VARCHAR(50) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(30) NULL,
    role VARCHAR(30) NOT NULL,
    company VARCHAR(100) NULL,
    hq_company_id BIGINT NULL,
    manager_company_id BIGINT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_users PRIMARY KEY (id),
    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT fk_users_hq_company
        FOREIGN KEY (hq_company_id) REFERENCES companies (id),
    CONSTRAINT fk_users_manager_company
        FOREIGN KEY (manager_company_id) REFERENCES companies (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE auth_tokens (
    token VARCHAR(255) NOT NULL,
    user_id BIGINT NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_auth_tokens PRIMARY KEY (token),
    CONSTRAINT fk_auth_tokens_user
        FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sites (
    id BIGINT NOT NULL AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    address VARCHAR(255) NOT NULL,
    owner_id BIGINT NOT NULL,
    code VARCHAR(50) NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    company_id BIGINT NULL,
    CONSTRAINT pk_sites PRIMARY KEY (id),
    CONSTRAINT uq_sites_code UNIQUE (code),
    CONSTRAINT fk_sites_owner
        FOREIGN KEY (owner_id) REFERENCES users (id),
    CONSTRAINT fk_sites_company
        FOREIGN KEY (company_id) REFERENCES companies (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE site_members (
    id BIGINT NOT NULL AUTO_INCREMENT,
    site_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    joined_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_site_members PRIMARY KEY (id),
    CONSTRAINT uq_site_members_site_user UNIQUE (site_id, user_id),
    CONSTRAINT fk_site_members_site
        FOREIGN KEY (site_id) REFERENCES sites (id),
    CONSTRAINT fk_site_members_user
        FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE site_processes (
    id BIGINT NOT NULL AUTO_INCREMENT,
    site_id BIGINT NOT NULL,
    process_key VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    weight DECIMAL(5,2) NOT NULL,
    progress DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    last_reported_at DATETIME(6) NULL,
    plan_start DATE NULL,
    plan_end DATE NULL,
    sort_order INT NOT NULL,
    CONSTRAINT pk_site_processes PRIMARY KEY (id),
    CONSTRAINT uq_site_processes_site_key UNIQUE (site_id, process_key),
    CONSTRAINT fk_site_processes_site
        FOREIGN KEY (site_id) REFERENCES sites (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE reports (
    id BIGINT NOT NULL AUTO_INCREMENT,
    site_id BIGINT NOT NULL,
    process_key VARCHAR(50) NOT NULL,
    process_name VARCHAR(100) NOT NULL,
    from_progress DECIMAL(5,2) NOT NULL,
    to_progress DECIMAL(5,2) NOT NULL,
    memo TEXT NULL,
    weather VARCHAR(100) NULL,
    workers INT NULL,
    equipment TEXT NULL,
    author_id BIGINT NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_reports PRIMARY KEY (id),
    CONSTRAINT fk_reports_site
        FOREIGN KEY (site_id) REFERENCES sites (id),
    CONSTRAINT fk_reports_author
        FOREIGN KEY (author_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE report_photos (
    report_id BIGINT NOT NULL,
    position INT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    CONSTRAINT fk_report_photos_report
        FOREIGN KEY (report_id) REFERENCES reports (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE report_files (
    report_id BIGINT NOT NULL,
    position INT NOT NULL,
    path VARCHAR(500) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    size_bytes BIGINT NOT NULL,
    CONSTRAINT fk_report_files_report
        FOREIGN KEY (report_id) REFERENCES reports (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE material_requests (
    id BIGINT NOT NULL AUTO_INCREMENT,
    site_id BIGINT NOT NULL,
    process_key VARCHAR(50) NOT NULL,
    process_name VARCHAR(100) NOT NULL,
    needed_by DATE NULL,
    urgent BOOLEAN NOT NULL DEFAULT FALSE,
    note TEXT NULL,
    status VARCHAR(30) NOT NULL,
    reject_reason TEXT NULL,
    author_id BIGINT NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_material_requests PRIMARY KEY (id),
    CONSTRAINT fk_material_requests_site
        FOREIGN KEY (site_id) REFERENCES sites (id),
    CONSTRAINT fk_material_requests_author
        FOREIGN KEY (author_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE material_request_items (
    request_id BIGINT NOT NULL,
    position INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    quantity DECIMAL(15,3) NOT NULL,
    unit VARCHAR(30) NOT NULL,
    CONSTRAINT fk_material_request_items_request
        FOREIGN KEY (request_id) REFERENCES material_requests (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE material_request_events (
    request_id BIGINT NOT NULL,
    position INT NOT NULL,
    status VARCHAR(30) NOT NULL,
    actor VARCHAR(100) NOT NULL,
    by_hq BOOLEAN NOT NULL,
    `at` DATETIME(6) NOT NULL,
    CONSTRAINT fk_material_request_events_request
        FOREIGN KEY (request_id) REFERENCES material_requests (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE device_tokens (
    id BIGINT NOT NULL AUTO_INCREMENT,
    token VARCHAR(512) NOT NULL,
    user_id BIGINT NOT NULL,
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_device_tokens PRIMARY KEY (id),
    CONSTRAINT uq_device_tokens_token UNIQUE (token),
    CONSTRAINT fk_device_tokens_user
        FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
