package com.buildup.server.config;

import com.buildup.server.auth.JwtTokens;
import com.buildup.server.auth.TokenAuthFilter;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
public class SecurityConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /** 스프링 기본 로그인 계정(자동 생성 비밀번호)을 만들지 않게 한다. 로그인은 토큰 방식만 사용. */
    @Bean
    public UserDetailsService noDefaultUser() {
        return username -> {
            throw new UsernameNotFoundException(username);
        };
    }

    @Bean
    public SecurityFilterChain filterChain(
            HttpSecurity http,
            JwtTokens jwt)
            throws Exception {
        http.csrf(csrf -> csrf.disable())
                .cors(cors -> {})
                .httpBasic(b -> b.disable())
                .formLogin(f -> f.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(a -> a
                        .requestMatchers("/api/auth/login", "/api/auth/signup", "/api/auth/refresh", "/api/auth/logout", "/api/auth/email/**", "/api/auth/phone/**", "/api/auth/oauth/**", "/api/health", "/files/**", "/downloads/**", "/error",
                                "/swagger-ui.html", "/swagger-ui/**", "/v3/api-docs/**")
                        .permitAll()
                        .anyRequest()
                        .authenticated())
                // 로그인 안 된 요청은 앱이 읽는 모양으로 401 응답
                .exceptionHandling(e -> e.authenticationEntryPoint((req, res, ex) -> {
                    res.setStatus(401);
                    res.setContentType(MediaType.APPLICATION_JSON_VALUE);
                    res.setCharacterEncoding(StandardCharsets.UTF_8.name());
                    res.getWriter().write("{\"message\":\"로그인이 필요합니다.\"}");
                }))
                .addFilterBefore(
                        new TokenAuthFilter(jwt),
                        UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    /** 웹 대시보드(다른 주소)에서 호출 허용. 운영에서는 buildup.cors-origins에 대시보드 주소만 적는다 */
    @Bean
    public CorsConfigurationSource corsConfigurationSource(
            @org.springframework.beans.factory.annotation.Value("${buildup.cors-origins:*}") List<String> origins) {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOriginPatterns(origins);
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        // 웹 대시보드가 엑셀 파일 이름(한글)을 읽을 수 있게
        config.setExposedHeaders(List.of("Content-Disposition"));
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
