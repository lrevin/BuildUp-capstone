package com.buildup.server.auth;

import com.buildup.server.common.ApiException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/**
 * 인증 코드 보내기
 * - 이메일: spring.mail.*(예: Gmail SMTP + 앱 비밀번호, 환경 변수 MAIL_USERNAME·MAIL_PASSWORD)이 있으면 메일로
 * - 문자: buildup.sms.*(솔라피 API 키, 환경 변수 SMS_API_KEY·SMS_API_SECRET·SMS_FROM)가 있으면 문자로
 * - 설정이 없으면(개발·테스트) 보내지 않고 서버 로그에 코드를 찍는다 → 키 없이도 앱·웹을 시험할 수 있다
 */
@Component
public class VerificationSender {

    private static final Logger log = LoggerFactory.getLogger(VerificationSender.class);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final ObjectProvider<JavaMailSender> mail;
    private final JsonMapper json;
    private final String mailFrom;
    private final String smsKey;
    private final String smsSecret;
    private final String smsFrom;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    /** 개발 모드(보낼 설정이 없을 때)에 마지막으로 만든 코드: 자동 테스트에서 읽는다 */
    private final Map<String, String> logged = new ConcurrentHashMap<>();

    public VerificationSender(
            ObjectProvider<JavaMailSender> mail,
            JsonMapper json,
            @Value("${spring.mail.username:}") String mailFrom,
            @Value("${buildup.sms.api-key:}") String smsKey,
            @Value("${buildup.sms.api-secret:}") String smsSecret,
            @Value("${buildup.sms.from:}") String smsFrom) {
        this.mail = mail;
        this.json = json;
        this.mailFrom = mailFrom;
        this.smsKey = smsKey;
        this.smsSecret = smsSecret;
        this.smsFrom = smsFrom.replaceAll("\\D", "");
    }

    public void email(String to, String code) {
        sendMail(to, code, "[Build Up] 이메일 인증 코드", "Build Up 가입 인증 코드는 ");
    }

    /** 비밀번호 재설정 코드 메일 */
    public void passwordEmail(String to, String code) {
        sendMail(to, code, "[Build Up] 비밀번호 재설정 코드", "Build Up 비밀번호 재설정 코드는 ");
    }

    private void sendMail(String to, String code, String subject, String lead) {
        JavaMailSender sender = mail.getIfAvailable();
        if (sender == null || mailFrom.isBlank()) {
            devLog("이메일", to, code);
            return;
        }
        SimpleMailMessage m = new SimpleMailMessage();
        m.setFrom(mailFrom);
        m.setTo(to);
        m.setSubject(subject);
        m.setText(lead + code + " 입니다.\n5분 안에 입력해 주세요.\n\n"
                + "본인이 요청하지 않았다면 이 메일은 무시해 주세요.");
        try {
            sender.send(m);
        } catch (Exception e) {
            log.warn("인증 메일 보내기 실패: {}", e.getMessage());
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "인증 메일을 보내지 못했어요. 잠시 뒤에 다시 시도해 주세요.");
        }
    }

    /** phone은 숫자만(예: 01012345678) */
    public void sms(String phone, String code) {
        if (smsKey.isBlank() || smsSecret.isBlank() || smsFrom.isBlank()) {
            devLog("문자", phone, code);
            return;
        }
        String text = "[Build Up] 인증번호 " + code + " (5분 안에 입력)";
        try {
            String date = Instant.now().toString();
            byte[] saltBytes = new byte[16];
            RANDOM.nextBytes(saltBytes);
            String salt = HexFormat.of().formatHex(saltBytes);
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(smsSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            String signature = HexFormat.of().formatHex(mac.doFinal((date + salt).getBytes(StandardCharsets.UTF_8)));
            String body = json.writeValueAsString(Map.of("message", Map.of("to", phone, "from", smsFrom, "text", text)));
            HttpRequest req = HttpRequest.newBuilder(URI.create("https://api.solapi.com/messages/v4/send"))
                    .timeout(Duration.ofSeconds(10))
                    .header("Content-Type", "application/json")
                    .header("Authorization", "HMAC-SHA256 apiKey=" + smsKey + ", date=" + date
                            + ", salt=" + salt + ", signature=" + signature)
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() / 100 != 2) {
                log.warn("인증 문자 보내기 실패: {} {}", res.statusCode(), res.body());
                throw new IllegalStateException("status " + res.statusCode());
            }
        } catch (Exception e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            log.warn("인증 문자 보내기 실패: {}", e.getMessage());
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "인증 문자를 보내지 못했어요. 잠시 뒤에 다시 시도해 주세요.");
        }
    }

    /** 개발 모드에서 마지막으로 만든 코드(실제로 보낸 경우는 null) */
    public String loggedCode(String target) {
        return logged.get(target);
    }

    private void devLog(String what, String target, String code) {
        logged.put(target, code);
        log.info("[개발 모드] {} 인증 코드 {} → {} (발송 설정이 없어 보내지 않음)", what, code, target);
    }
}
