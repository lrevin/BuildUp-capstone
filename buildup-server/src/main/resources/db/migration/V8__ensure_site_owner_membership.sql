INSERT INTO site_members (site_id, user_id, member_role, status)
SELECT id, owner_id, 'OWNER', 'ACTIVE'
FROM sites
ON DUPLICATE KEY UPDATE
    member_role = 'OWNER',
    status = 'ACTIVE';
