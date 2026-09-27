package com.buildup.server.hq;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CompanyRepository extends JpaRepository<Company, Long> {

    Optional<Company> findByCode(String code);

    boolean existsByCode(String code);
}
