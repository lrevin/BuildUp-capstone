package com.buildup.server.system;

import com.buildup.server.user.Role;
import com.buildup.server.user.User;
import com.buildup.server.user.UserRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 운영 서버: 시스템 관리자 계정은 가입으로 만들 수 없으므로 환경 변수로 만든다.
 *   SYSTEM_ADMIN_EMAIL, SYSTEM_ADMIN_PASSWORD(12자 이상) → 그 이메일 계정이 없으면 만든다(있으면 그대로).
 */
@Component
@RequiredArgsConstructor
public class SystemAdminInitializer implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(SystemAdminInitializer.class);

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;

    @Value("${buildup.system-admin.email:}")
    private String email;

    @Value("${buildup.system-admin.password:}")
    private String password;

    @Override
    @Transactional
    public void run(String... args) {
        if (email.isBlank() || password.isBlank()) {
            return;
        }
        String e = email.trim().toLowerCase();
        if (users.findByEmail(e).isPresent()) {
            return;
        }
        if (password.length() < 12) {
            log.warn("SYSTEM_ADMIN_PASSWORD는 12자 이상이어야 해서 시스템 관리자를 만들지 않았어요.");
            return;
        }
        User u = new User();
        u.setName("시스템 관리자");
        u.setEmail(e);
        u.setPhone("-");
        u.setRole(Role.SYSTEM);
        u.setCompany("Build Up 운영팀");
        u.setPasswordHash(passwordEncoder.encode(password));
        users.save(u);
        log.info("시스템 관리자 계정을 만들었어요: {}", e);
    }
}
