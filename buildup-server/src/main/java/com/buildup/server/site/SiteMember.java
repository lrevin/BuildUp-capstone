package com.buildup.server.site;

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
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 현장 참여자(코드로 참여하거나 현장을 만든 관리자) */
@Entity
@Table(
        name = "site_members",
        uniqueConstraints = @UniqueConstraint(columnNames = {"site_id", "user_id"}))
@Getter
@Setter
@NoArgsConstructor
public class SiteMember {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "site_id")
    private Site site;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id")
    private User user;

    @Column(nullable = false)
    private Instant joinedAt = Instant.now();

    public SiteMember(Site site, User user, Instant joinedAt) {
        this.site = site;
        this.user = user;
        this.joinedAt = joinedAt;
    }
}
