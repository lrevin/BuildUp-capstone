package com.buildup.server.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * API 문서(Swagger): 서버를 켜고 브라우저에서 /swagger-ui.html
 * 오른쪽 위 Authorize에 로그인 응답의 token을 넣으면 로그인이 필요한 API도 바로 시험할 수 있다.
 * 운영(prod)에서는 기본으로 꺼 둔다(API_DOCS=true로 켤 수 있음).
 */
@Configuration
public class ApiDocsConfig {

    @Bean
    public OpenAPI buildupOpenApi() {
        String scheme = "token";
        return new OpenAPI()
                .info(new Info()
                        .title("Build Up API")
                        .version("1.0")
                        .description("공사 현장 관리 앱 Build Up의 서버 API(건설·인테리어 공사).\n"
                                + "로그인(POST /api/auth/login) 응답의 token을 Authorize에 넣고 시험한다.\n"
                                + "테스트 계정(데모 데이터): admin@buildup.kr / worker@buildup.kr / hq@buildup.kr, 비밀번호 1234"))
                .components(new Components().addSecuritySchemes(scheme, new SecurityScheme()
                        .type(SecurityScheme.Type.HTTP)
                        .scheme("bearer")
                        .description("로그인 응답의 token")))
                .addSecurityItem(new SecurityRequirement().addList(scheme));
    }
}
