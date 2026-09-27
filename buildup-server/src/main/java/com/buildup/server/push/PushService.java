package com.buildup.server.push;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.AndroidConfig;
import com.google.firebase.messaging.BatchResponse;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingException;
import com.google.firebase.messaging.MessagingErrorCode;
import com.google.firebase.messaging.MulticastMessage;
import com.google.firebase.messaging.Notification;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 휴대폰 알림 보내기(Firebase Cloud Messaging).
 * - 서버 폴더의 firebase-key.json(운영: FIREBASE_KEY 환경 변수 경로)이 있어야 켜진다. 없으면 알림만 건너뛴다.
 * - 저장(커밋)이 끝난 뒤, 따로 도는 작업으로 보낸다 → 알림이 늦거나 실패해도 보고·자재 요청은 그대로 저장된다.
 * - 앱을 지웠거나 로그아웃해서 못 받는 기기 주소는 지운다.
 */
@Service
@RequiredArgsConstructor
public class PushService {

    private static final Logger log = LoggerFactory.getLogger(PushService.class);
    private static final Set<MessagingErrorCode> DEAD =
            Set.of(MessagingErrorCode.UNREGISTERED, MessagingErrorCode.INVALID_ARGUMENT);

    private final DeviceTokenRepository devices;
    private final TransactionTemplate tx;
    private final ExecutorService worker = Executors.newFixedThreadPool(2, r -> {
        Thread t = new Thread(r, "push-sender");
        t.setDaemon(true);
        return t;
    });

    @Value("${buildup.firebase-key:firebase-key.json}")
    private String keyPath;

    private FirebaseMessaging messaging; // null이면 알림 꺼짐

    @PostConstruct
    void init() {
        Path path = Path.of(keyPath);
        if (!Files.isRegularFile(path)) {
            log.info("알림 꺼짐: Firebase 키 파일이 없습니다 ({})", path.toAbsolutePath());
            return;
        }
        try (InputStream in = Files.newInputStream(path)) {
            FirebaseOptions options = FirebaseOptions.builder()
                    .setCredentials(GoogleCredentials.fromStream(in))
                    .build();
            FirebaseApp app = FirebaseApp.getApps().stream()
                    .filter(a -> a.getName().equals("buildup"))
                    .findFirst()
                    .orElseGet(() -> FirebaseApp.initializeApp(options, "buildup"));
            messaging = FirebaseMessaging.getInstance(app);
            log.info("알림 켜짐: Firebase 연결 완료");
        } catch (Exception e) {
            log.warn("알림 꺼짐: Firebase 키 파일을 읽지 못했습니다 ({})", e.getMessage());
        }
    }

    @PreDestroy
    void shutdown() {
        worker.shutdown();
    }

    public boolean enabled() {
        return messaging != null;
    }

    /**
     * 여러 사람에게 알림. 지금 저장 중이면 저장이 끝난 뒤에 보낸다.
     * data: 앱이 알림을 눌렀을 때 어느 화면을 열지(type, siteId, siteName 등)
     */
    public void notifyUsers(Collection<Long> userIds, String title, String body, Map<String, String> data) {
        if (messaging == null || userIds == null || userIds.isEmpty()) {
            return;
        }
        List<Long> ids = List.copyOf(Set.copyOf(userIds));
        Runnable job = () -> worker.execute(() -> send(ids, title, body, data));
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    job.run();
                }
            });
        } else {
            job.run();
        }
    }

    private void send(List<Long> userIds, String title, String body, Map<String, String> data) {
        try {
            List<String> tokens = devices.tokensOf(userIds);
            List<String> dead = new ArrayList<>();
            // 한 번에 최대 500대
            for (int from = 0; from < tokens.size(); from += 500) {
                List<String> chunk = tokens.subList(from, Math.min(tokens.size(), from + 500));
                MulticastMessage msg = MulticastMessage.builder()
                        .addAllTokens(chunk)
                        .setNotification(Notification.builder().setTitle(title).setBody(body).build())
                        .putAllData(data)
                        .setAndroidConfig(AndroidConfig.builder()
                                .setPriority(AndroidConfig.Priority.HIGH)
                                .build())
                        .build();
                BatchResponse res = messaging.sendEachForMulticast(msg);
                for (int i = 0; i < res.getResponses().size(); i++) {
                    FirebaseMessagingException ex = res.getResponses().get(i).getException();
                    if (ex != null && DEAD.contains(ex.getMessagingErrorCode())) {
                        dead.add(chunk.get(i));
                    }
                }
            }
            if (!dead.isEmpty()) {
                tx.executeWithoutResult(s -> devices.deleteTokens(dead));
            }
        } catch (Exception e) {
            log.warn("알림 보내기 실패: {}", e.getMessage());
        }
    }
}
