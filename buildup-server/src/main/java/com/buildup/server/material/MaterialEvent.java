package com.buildup.server.material;

import com.buildup.server.user.User;
import jakarta.persistence.Column;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Embeddable;
import java.time.Instant;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 자재 요청 처리 이력 한 줄: 누가 언제 요청·승인·발주·입고·반려했는지 */
@Embeddable
@Getter
@NoArgsConstructor
@AllArgsConstructor
public class MaterialEvent {

    @Column(nullable = false, length = 30)
    private String status;

    /** 처리한 사람 이름(나중에 이름이 바뀌어도 당시 이름 유지) */
    @Column(nullable = false, length = 100)
    private String actor;

    /** 처리한 사람 */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "actor_user_id")
    private User actorUser;

    /** 본사 관계자가 처리했는지(화면에 '본사' 표시) */
    @Column(name = "by_hq", nullable = false, columnDefinition = "tinyint(1)")
    private boolean byHq;

    @Column(nullable = false, columnDefinition = "datetime(6)")
    private Instant at;
}
