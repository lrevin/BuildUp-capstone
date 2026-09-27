package com.buildup.server.report;

import java.io.IOException;
import org.springframework.web.multipart.MultipartFile;

/**
 * 사진·첨부 파일을 두는 곳.
 *   local: 서버 폴더(uploads) — 기본값, 개발·소규모 운영
 *   s3   : AWS S3 버킷 — 파일이 계속 쌓여도 서버 디스크를 쓰지 않는다(계획서 6-3)
 * key 예: "3f2a….jpg"(사진), "docs/무작위/공정표.pdf"(첨부)
 */
public interface ObjectStore {

    void put(String key, MultipartFile file, String contentType) throws IOException;

    void delete(String key);

    /**
     * 앱·웹에서 열 주소.
     * downloadName이 있으면 내려받을 때 그 이름으로 저장되게 한다(한글 파일 이름 유지).
     */
    String url(String key, String downloadName);
}
