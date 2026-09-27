package com.buildup.server.user;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByEmail(String email);

    List<User> findByHqCompanyIdOrderById(Long companyId);

    boolean existsByEmail(String email);

    long countByRole(com.buildup.server.user.Role role);
}
