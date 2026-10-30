-- 가입 약관 동의 기록
-- 가입(또는 탈퇴 후 7일 안에 다시 가입)할 때 만 14세 이상 확인 · 이용약관 · 개인정보 수집·이용에 모두 동의해야 한다.
-- 동의한 시각과 그때의 약관 버전(시행일)을 남긴다. 이 기능 전에 가입한 계정은 비어 있다.

ALTER TABLE users
    ADD COLUMN terms_agreed_at   DATETIME(6) NULL AFTER deleted_at,
    ADD COLUMN privacy_agreed_at DATETIME(6) NULL AFTER terms_agreed_at,
    ADD COLUMN policy_version    VARCHAR(20) NULL AFTER privacy_agreed_at;
