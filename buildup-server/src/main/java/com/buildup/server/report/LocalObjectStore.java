package com.buildup.server.report;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

/** 서버 폴더(uploads)에 저장하고 /files/... 주소로 내려준다(WebConfig) */
class LocalObjectStore implements ObjectStore {

    private static final Logger log = LoggerFactory.getLogger(LocalObjectStore.class);
    private final Path dir;

    LocalObjectStore(Path dir) throws IOException {
        this.dir = dir;
        Files.createDirectories(dir);
    }

    @Override
    public void put(String key, MultipartFile file, String contentType) throws IOException {
        Path target = dir.resolve(key).normalize();
        if (!target.startsWith(dir)) {
            throw new IOException("잘못된 파일 위치: " + key);
        }
        Files.createDirectories(target.getParent());
        file.transferTo(target);
    }

    @Override
    public void delete(String key) {
        try {
            Path p = dir.resolve(key).normalize();
            Files.deleteIfExists(p);
            // 첨부 문서는 docs/무작위폴더/이름 → 빈 폴더도 지운다
            if (key.startsWith("docs/")) {
                Files.deleteIfExists(p.getParent());
            }
        } catch (IOException e) {
            log.warn("파일 삭제 실패: {}", key, e);
        }
    }

    /** 요청을 보낸 기기가 접속한 주소 기준 URL (예: http://10.0.2.2:8080/files/abc.jpg) */
    @Override
    public String url(String key, String downloadName) {
        return ServletUriComponentsBuilder.fromCurrentContextPath()
                .path("/files/")
                .pathSegment(key.split("/"))
                .build()
                .encode()
                .toUriString();
    }
}
