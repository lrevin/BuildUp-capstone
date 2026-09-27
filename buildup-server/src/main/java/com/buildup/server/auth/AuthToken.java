package com.buildup.server.auth;

import com.buildup.server.user.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 로그인 기록(JWT의 토큰 번호 jti). 로그아웃하면 행을 지워 그 JWT를 바로 무효화한다. */
@Entity
@Table(name = "auth_tokens")
@Getter
@Setter
@NoArgsConstructor
public class AuthToken {

    @Id
    @Column(length = 64)
    private String token;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id")
    private User user;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    public AuthToken(String token, User user) {
        this.token = token;
        this.user = user;
    }
}
