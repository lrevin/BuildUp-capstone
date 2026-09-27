package com.buildup.server.hq;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * 본사. 본사 관계자가 가입할 때 만들고 6자리 본사 코드를 받는다.
 * 현장 총관리자가 이 코드로 현장을 연결하면 그 현장의 보고·자재 요청이 본사로 올라간다.
 */
@Entity
@Table(name = "companies")
@Getter
@Setter
@NoArgsConstructor
public class Company {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 80)
    private String name;

    /** 6자리 본사 코드(현장 참여 코드와는 별개) */
    @Column(nullable = false, unique = true, length = 6)
    private String code;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();
}
