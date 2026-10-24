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
import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * 가입 인증: 이메일 코드, 휴대폰 문자 코드, 그리고 가입할 때 인증을 마쳤는지 확인.
 * buildup.verification.required=true(기본)면 이메일·휴대폰 인증 없이는 가입할 수 없다.
 * 보내기 제한(문자 요금·스팸 방지): 기기(IP)당 1시간 10번, 같은 이메일·번호에 1시간 5번·하루 10번
 */
@Service
public class SignupVerification {

    static final int PER_TARGET_HOUR = 5;
    static final int PER_TARGET_DAY = 10;
    /** 한 기기(IP)에서 10분 동안 틀릴 수 있는 인증 코드 수 */
    static final int WRONG_PER_IP = 30;

    private final Verifications verifications;
    private final VerificationSender sender;
    private final UserRepository users;
    private final AttemptLimiter limiter;
    private final boolean required;
    /** 한 기기(IP)에서 1시간에 받을 수 있는 인증 코드 수 */
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

    /**
     * 가입 요청에서 확인한 인증 결과. 토큰은 이때 꺼내 썼으므로(한 번만 사용),
     * 가입이 실패하면 undo()로 되돌려 놓는다.
     */
    public record Checked(boolean emailVerified, boolean phoneVerified, Granted kakao, Runnable undo) {}

    public CodeSentResponse sendEmail(String rawEmail) {
        String email = normalizeEmail(rawEmail);
        // 가입 여부를 마구 알아보지 못하게 횟수부터 센다
        countSend(Kind.EMAIL, email);
        if (users.existsByEmail(email)) {
            throw ApiException.conflict("이미 가입된 이메일입니다.");
        }
        sender.email(email, verifications.newCode(Kind.EMAIL, email));
        return sent();
    }

    public EmailVerifiedResponse verifyEmail(String rawEmail, String code) {
        String token = verify(Kind.EMAIL, normalizeEmail(rawEmail), code);
        return new EmailVerifiedResponse(token, verifications.ttlSeconds(Kind.EMAIL));
    }

    public CodeSentResponse sendPhone(String rawPhone) {
        String phone = normalizePhone(rawPhone);
        countSend(Kind.PHONE, phone);
        sender.sms(phone, verifications.newCode(Kind.PHONE, phone));
        return sent();
    }

    public PhoneVerifiedResponse verifyPhone(String rawPhone, String code) {
        String token = verify(Kind.PHONE, normalizePhone(rawPhone), code);
        return new PhoneVerifiedResponse(token, verifications.ttlSeconds(Kind.PHONE));
    }

    /** 코드 확인(한 기기에서 틀린 횟수도 센다: 여러 번호·이메일을 돌아가며 맞혀 보는 것 방지) */
    private String verify(Kind kind, String target, String code) {
        String ipKey = "verify-wrong:" + AttemptLimiter.clientIp();
        limiter.check(ipKey, WRONG_PER_IP, Duration.ofMinutes(10), "인증 코드를");
        try {
            return verifications.verify(kind, target, code);
        } catch (ApiException e) {
            limiter.fail(ipKey);
            throw e;
        }
    }

    /** 가입할 때: 이메일·휴대폰 인증, 카카오 가입 토큰 확인(토큰은 꺼내 쓴다) */
    public Checked check(SignUpRequest req, String email) {
        List<Runnable> undo = new ArrayList<>();
        Runnable undoAll = () -> undo.forEach(Runnable::run);

        Granted kakao = null;
        if (req.signupToken() != null && !req.signupToken().isBlank()) {
            kakao = verifications.take(req.signupToken(), Kind.KAKAO);
            if (kakao == null) {
                throw ApiException.badRequest("카카오 로그인 시간이 지났어요. 카카오 로그인을 다시 해 주세요.");
            }
            Granted k = kakao;
            undo.add(() -> verifications.putBack(req.signupToken(), k));
        }
        // 카카오가 인증해 준 이메일 그대로 가입하면 이메일 인증은 생략
        boolean emailVerified = kakao != null && email.equals(kakao.data().get("email"));
        if (!emailVerified) {
            emailVerified = takeIfMatches(req.emailVerificationToken(), Kind.EMAIL, email, undo);
        }
        boolean phoneVerified = takeIfMatches(req.phoneVerificationToken(), Kind.PHONE, digits(req.phone()), undo);
        if (required && !emailVerified) {
            undoAll.run();
            throw ApiException.badRequest("이메일 인증을 완료해 주세요.");
        }
        if (required && !phoneVerified) {
            undoAll.run();
            throw ApiException.badRequest("휴대폰 인증을 완료해 주세요.");
        }
        return new Checked(emailVerified, phoneVerified, kakao, undoAll);
    }

    /** 토큰이 이 이메일·번호 것이면 꺼내 쓰고 true. 다른 값의 토큰이면 그대로 돌려 놓는다 */
    private boolean takeIfMatches(String token, Kind kind, String target, List<Runnable> undo) {
        Granted g = verifications.take(token, kind);
        if (g == null) {
            return false;
        }
        if (!g.target().equals(target)) {
            verifications.putBack(token, g);
            return false;
        }
        undo.add(() -> verifications.putBack(token, g));
        return true;
    }

    /** 보내기 횟수 제한: 기기(IP)당, 그리고 같은 이메일·번호당(IP를 바꿔 가며 한 번호로 문자 폭탄 방지) */
    private void countSend(Kind kind, String target) {
        String ip = AttemptLimiter.clientIp();
        limiter.hit("verify-send:" + ip, sendsPerHour, Duration.ofHours(1), "인증 코드를 너무 많이 요청했어요.");
        String t = "verify-target:" + kind + ":" + target;
        limiter.hit(t + ":h", PER_TARGET_HOUR, Duration.ofHours(1), "이 " + label(kind) + "로 인증 코드를 너무 많이 요청했어요.");
        limiter.hit(t + ":d", PER_TARGET_DAY, Duration.ofDays(1), "이 " + label(kind) + "로 오늘 인증 코드를 너무 많이 요청했어요.");
    }

    private static String label(Kind kind) {
        return kind == Kind.EMAIL ? "이메일" : "번호";
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
