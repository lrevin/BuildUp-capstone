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

/** Authorization: Bearer {토큰} 헤더를 확인해 로그인한 사용자 id를 보안 컨텍스트에 넣는다. */
public class TokenAuthFilter extends OncePerRequestFilter {

    private final AuthTokenRepository tokens;
    private final java.time.Duration validFor;

    public TokenAuthFilter(AuthTokenRepository tokens, java.time.Duration validFor) {
        this.tokens = tokens;
        this.validFor = validFor;
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
            // 로그인한 지 오래된 토큰은 무시(다시 로그인해야 함)
            var found = tokens.findWithUserByToken(token);
            if (found.isPresent() && !found.get().getCreatedAt().plus(validFor).isAfter(java.time.Instant.now())) {
                tokens.deleteById(token);
                found = java.util.Optional.empty();
            }
            found.ifPresent(t -> {
                var auth = new UsernamePasswordAuthenticationToken(t.getUser().getId(), token, List.of());
                SecurityContextHolder.getContext().setAuthentication(auth);
            });
        }
        chain.doFilter(request, response);
    }
}
