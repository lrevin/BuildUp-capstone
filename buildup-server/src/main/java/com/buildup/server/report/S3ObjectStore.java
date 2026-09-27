package com.buildup.server.report;

import java.io.IOException;
import java.io.InputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;

/**
 * AWS S3에 저장(계획서 6-3: 사진은 DB가 아닌 S3, DB에는 위치만).
 * - 버킷은 공개하지 않는다. 앱·웹에는 6시간짜리 임시 주소(presigned URL)를 준다.
 * - 접속 키는 코드·설정 파일에 적지 않는다: EC2에 IAM 역할을 붙이거나 AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY 환경 변수.
 */
class S3ObjectStore implements ObjectStore {

    private static final Logger log = LoggerFactory.getLogger(S3ObjectStore.class);
    static final Duration LINK_VALID = Duration.ofHours(6);

    private final S3Client s3;
    private final S3Presigner presigner;
    private final String bucket;
    private final String prefix;

    S3ObjectStore(String bucket, String region, String prefix, AwsCredentialsProvider credentials) {
        this.bucket = bucket;
        this.prefix = prefix == null || prefix.isBlank() ? "" : prefix.replaceAll("/+$", "") + "/";
        var s3b = S3Client.builder().region(Region.of(region));
        var pb = S3Presigner.builder().region(Region.of(region));
        if (credentials != null) {
            s3b.credentialsProvider(credentials);
            pb.credentialsProvider(credentials);
        }
        this.s3 = s3b.build();
        this.presigner = pb.build();
        log.info("파일 저장소: AWS S3 (버킷 {}, 지역 {})", bucket, region);
    }

    @Override
    public void put(String key, MultipartFile file, String contentType) throws IOException {
        try (InputStream in = file.getInputStream()) {
            s3.putObject(PutObjectRequest.builder()
                            .bucket(bucket)
                            .key(prefix + key)
                            .contentType(contentType)
                            .build(),
                    RequestBody.fromInputStream(in, file.getSize()));
        }
    }

    @Override
    public void delete(String key) {
        try {
            s3.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(prefix + key).build());
        } catch (RuntimeException e) {
            log.warn("S3 파일 삭제 실패: {}", key, e);
        }
    }

    @Override
    public String url(String key, String downloadName) {
        GetObjectRequest.Builder get = GetObjectRequest.builder().bucket(bucket).key(prefix + key);
        if (downloadName != null) {
            // 내려받을 때 원래(한글) 파일 이름으로 저장
            get.responseContentDisposition("attachment; filename*=UTF-8''"
                    + URLEncoder.encode(downloadName, StandardCharsets.UTF_8).replace("+", "%20"));
        }
        return presigner.presignGetObject(GetObjectPresignRequest.builder()
                        .signatureDuration(LINK_VALID)
                        .getObjectRequest(get.build())
                        .build())
                .url()
                .toString();
    }
}
