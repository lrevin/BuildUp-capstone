package com.buildup.server.auth;

import com.buildup.server.auth.AuthDtos.CodeSentResponse;
import com.buildup.server.auth.AuthDtos.EmailVerifiedResponse;
import com.buildup.server.auth.AuthDtos.PhoneVerifiedResponse;
import com.buildup.server.auth.AuthDtos.SignUpRequest;
import com.buildup.server.auth.Verifications.Granted;
import com.buildup.server.auth.Verifications.Kind;
import com.buildup.server.common.ApiException;
import com.buildup.server.common.AttemptLimiter;
import com.buildup.server.user.UserRepository;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * 가입 인증: 이메일 코드, 휴대폰 문자 코드, 그리고 가입할 때 인증을 마쳤는지 확인.
 * buildup.verification.required=true(기본)면 이메일·휴대폰 인증 없이는 가입할 수 없다.
 */
@Service
public class SignupVerification {

    private final Verifications verifications;
    private final VerificationSender sender;
    private final UserRepository users;
    private final AttemptLimiter limiter;
    private final boolean required;
    /** 한 기기(IP)에서 1시간에 받을 수 있는 인증 코드 수(문자 요금·스팸 방지) */
    private final int sendsPerHour;

    public SignupVerification(
            Verifications verifications,
            VerificationSender sender,
            UserRepository users,
            AttemptLimiter limiter,
            @Value("${buildup.verification.required:true}") boolean required,
            @Value("${buildup.verification.sends-per-hour:10}") int sendsPerHour) {
        this.verifications = verifications;
        this.sender = sender;
        this.users = users;
        this.limiter = limiter;
        this.required = required;
        this.sendsPerHour = sendsPerHour;
    }

    /** 가입 요청에서 확인한 인증 결과 */
    public record Checked(boolean emailVerified, boolean phoneVerified, Granted kakao) {}

    public CodeSentResponse sendEmail(String rawEmail) {
        String email = normalizeEmail(rawEmail);
        if (users.existsByEmail(email)) {
            throw ApiException.conflict("이미 가입된 이메일입니다.");
        }
        countSend();
        sender.email(email, verifications.newCode(Kind.EMAIL, email));
        return sent();
    }

    public EmailVerifiedResponse verifyEmail(String rawEmail, String code) {
        String token = verifications.verify(Kind.EMAIL, normalizeEmail(rawEmail), code);
        return new EmailVerifiedResponse(token, verifications.ttlSeconds(Kind.EMAIL));
    }

    public CodeSentResponse sendPhone(String rawPhone) {
        String phone = normalizePhone(rawPhone);
        countSend();
        sender.sms(phone, verifications.newCode(Kind.PHONE, phone));
        return sent();
    }

    public PhoneVerifiedResponse verifyPhone(String rawPhone, String code) {
        String token = verifications.verify(Kind.PHONE, normalizePhone(rawPhone), code);
        return new PhoneVerifiedResponse(token, verifications.ttlSeconds(Kind.PHONE));
    }

    /** 가입할 때: 이메일·휴대폰 인증, 카카오 가입 토큰 확인 */
    public Checked check(SignUpRequest req, String email) {
        Granted kakao = null;
        if (req.signupToken() != null && !req.signupToken().isBlank()) {
            kakao = verifications.find(req.signupToken(), Kind.KAKAO);
            if (kakao == null) {
                throw ApiException.badRequest("카카오 로그인 시간이 지났어요. 카카오 로그인을 다시 해 주세요.");
            }
        }
        // 카카오가 인증해 준 이메일 그대로 가입하면 이메일 인증은 생략
        boolean emailVerified = (kakao != null && email.equals(kakao.data().get("email")))
                || matches(verifications.find(req.emailVerificationToken(), Kind.EMAIL), email);
        Granted phoneToken = verifications.find(req.phoneVerificationToken(), Kind.PHONE);
        boolean phoneVerified = phoneToken != null && phoneToken.target().equals(digits(req.phone()));
        if (required && !emailVerified) {
            throw ApiException.badRequest("이메일 인증을 완료해 주세요.");
        }
        if (required && !phoneVerified) {
            throw ApiException.badRequest("휴대폰 인증을 완료해 주세요.");
        }
        return new Checked(emailVerified, phoneVerified, kakao);
    }

    /** 가입이 끝나면 쓴 인증 토큰을 지운다(같은 인증으로 계정을 또 만들 수 없게) */
    public void consume(SignUpRequest req) {
        verifications.consume(req.emailVerificationToken(), req.phoneVerificationToken(), req.signupToken());
    }

    private static boolean matches(Granted g, String target) {
        return g != null && g.target().equals(target);
    }

    private void countSend() {
        String key = "verify-send:" + AttemptLimiter.clientIp();
        limiter.checkLimit(key, sendsPerHour, Duration.ofHours(1), "인증 코드를 너무 많이 요청했어요.");
        limiter.fail(key);
    }

    private CodeSentResponse sent() {
        return new CodeSentResponse(Verifications.CODE_TTL.toSeconds(), Verifications.RESEND_AFTER.toSeconds());
    }

    static String normalizeEmail(String email) {
        return email == null ? "" : email.trim().toLowerCase();
    }

    /** 010-1234-5678 → 01012345678 (휴대폰 번호만 받는다) */
    static String normalizePhone(String phone) {
        String d = digits(phone);
        if (!d.matches("01[016789]\\d{7,8}")) {
            throw ApiException.badRequest("휴대폰 번호를 확인해 주세요.");
        }
        return d;
    }

    private static String digits(String s) {
        return s == null ? "" : s.replaceAll("\\D", "");
    }
}
