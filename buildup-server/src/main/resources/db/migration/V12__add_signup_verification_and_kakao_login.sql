-- 가입 인증(이메일·휴대폰 필수)과 카카오 로그인
-- 1) 카카오로만 가입한 계정은 비밀번호가 없다
-- 2) 이메일·휴대폰을 인증한 시각
-- 3) 카카오 계정 연결(카카오 회원번호 하나 = 우리 계정 하나)
-- 인증 코드 자체는 5분짜리라 서버 메모리에만 두고 DB에는 저장하지 않는다

ALTER TABLE users
    MODIFY password_hash VARCHAR(255) NULL,
    ADD COLUMN email_verified_at DATETIME(6) NULL AFTER password_hash,
    ADD COLUMN phone_verified_at DATETIME(6) NULL AFTER email_verified_at;

CREATE TABLE user_social_accounts (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    provider VARCHAR(20) NOT NULL,
    provider_user_id VARCHAR(100) NOT NULL,
    email VARCHAR(255) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_user_social_accounts PRIMARY KEY (id),
    CONSTRAINT uk_user_social_accounts_provider_user
        UNIQUE (provider, provider_user_id),
    CONSTRAINT uk_user_social_accounts_user_provider
        UNIQUE (user_id, provider),
    CONSTRAINT fk_user_social_accounts_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
