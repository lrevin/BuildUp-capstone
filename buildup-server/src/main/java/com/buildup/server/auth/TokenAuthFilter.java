package com.buildup.server.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/** Authorization: Bearer {JWT} 헤더를 확인해 로그인한 사용자 id를 보안 컨텍스트에 넣는다. */
public class TokenAuthFilter extends OncePerRequestFilter {

    private final JwtTokens jwt;

    public TokenAuthFilter(JwtTokens jwt) {
        this.jwt = jwt;
    }

    public static String bearer(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        return header != null && header.startsWith("Bearer ") ? header.substring(7).trim() : null;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String token = bearer(request);
        if (token != null) {
            // 서명이 틀렸거나, 만료됐거나, 로그아웃한 토큰은 무시 → 로그인이 필요한 API는 401
            jwt.verify(token).ifPresent(userId -> {
                var auth = new UsernamePasswordAuthenticationToken(userId, token, List.of());
                SecurityContextHolder.getContext().setAuthentication(auth);
            });
        }
        chain.doFilter(request, response);
    }
}
