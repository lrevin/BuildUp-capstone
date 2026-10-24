ALTER TABLE site_members
    ADD COLUMN member_role VARCHAR(30) NOT NULL DEFAULT 'WORKER' AFTER user_id,
    ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' AFTER member_role;

UPDATE site_members sm
JOIN sites s ON s.id = sm.site_id AND s.owner_id = sm.user_id
SET sm.member_role = 'OWNER';

CREATE TABLE company_memberships (
    id BIGINT NOT NULL AUTO_INCREMENT,
    company_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    role VARCHAR(30) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    joined_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_company_memberships PRIMARY KEY (id),
    CONSTRAINT uq_company_memberships_company_user UNIQUE (company_id, user_id),
    CONSTRAINT fk_company_memberships_company
        FOREIGN KEY (company_id) REFERENCES companies (id),
    CONSTRAINT fk_company_memberships_user
        FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
