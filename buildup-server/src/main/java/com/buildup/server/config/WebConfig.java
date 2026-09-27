package com.buildup.server.config;

import java.nio.file.Path;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** 업로드한 사진을 /files/{파일명} 으로 내려준다. */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Value("${buildup.upload-dir}")
    private String uploadDir;

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        String location = Path.of(uploadDir).toAbsolutePath().toUri().toString();
        registry.addResourceHandler("/files/**").addResourceLocations(location);
    }

    /** 앱의 '서버 연결 확인'용 */
    @RestController
    @io.swagger.v3.oas.annotations.tags.Tag(name = "00 서버 상태", description = "서버가 켜져 있는지 확인")
    static class HealthController {
        @io.swagger.v3.oas.annotations.Operation(summary = "서버 연결 확인(로그인 불필요)")
        @GetMapping("/api/health")
        public Map<String, String> health() {
            return Map.of("status", "ok", "service", "buildup-server");
        }
    }
}
