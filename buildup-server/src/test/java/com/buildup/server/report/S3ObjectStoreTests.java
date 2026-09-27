package com.buildup.server.report;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;

/** S3 임시 주소(presigned URL) 만들기: 네트워크 없이 서명만 확인(가짜 키) */
class S3ObjectStoreTests {

    private final S3ObjectStore store = new S3ObjectStore(
            "buildup-test-bucket", "ap-northeast-2", "reports",
            StaticCredentialsProvider.create(AwsBasicCredentials.create("AKIAEXAMPLEKEY000000", "fake-secret-for-test")));

    @Test
    void 사진_주소는_서명된_임시_주소() {
        String url = store.url("abc.jpg", null);
        assertThat(url).startsWith("https://buildup-test-bucket.s3.ap-northeast-2.amazonaws.com/reports/abc.jpg?");
        assertThat(url).contains("X-Amz-Signature=").contains("X-Amz-Expires=21600");
    }

    @Test
    void 첨부_문서는_원래_한글_이름으로_내려받기() {
        String url = store.url("docs/1234/공정표.pdf", "공정표.pdf");
        assertThat(url).contains("response-content-disposition=");
        assertThat(url).contains("X-Amz-Signature=");
    }
}
