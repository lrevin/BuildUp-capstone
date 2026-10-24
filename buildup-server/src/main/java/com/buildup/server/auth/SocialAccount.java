package com.buildup.server.auth;

import com.buildup.server.user.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 소셜 로그인 연결(DB 설계 V12 `user_social_accounts`). 지금은 카카오만 */
@Entity
@Table(name = "user_social_accounts")
@Getter
@NoArgsConstructor
public class SocialAccount {

    public static final String KAKAO = "kakao";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id")
    private User user;

    @Column(nullable = false, length = 20)
    private String provider;

    /** 카카오 회원번호 */
    @Column(nullable = false, length = 100)
    private String providerUserId;

    @Column(length = 255)
    private String email;

    @Column(nullable = false, columnDefinition = "datetime(6)")
    private Instant createdAt = Instant.now();

    public SocialAccount(User user, String provider, String providerUserId, String email) {
        this.user = user;
        this.provider = provider;
        this.providerUserId = providerUserId;
        this.email = email;
    }
}
