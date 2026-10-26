-- 회원 탈퇴
-- 탈퇴를 신청한 시각을 남기고, 7일이 지나면 서버가 계정 정보를 영구 삭제한다(AccountDeletion).
-- 다른 사람 현장에 남긴 보고·자재 요청이 있으면 그 기록은 지우지 않고 계정 정보만 지운다(이름 '탈퇴한 사용자').

ALTER TABLE users
    ADD COLUMN deleted_at DATETIME(6) NULL AFTER phone_verified_at;

CREATE INDEX idx_users_deleted_at ON users (deleted_at);
