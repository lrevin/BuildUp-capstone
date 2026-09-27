package com.buildup.server.report;

import com.buildup.server.common.ApiException;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

/** 보고 사진·첨부 문서를 서버 폴더(uploads)에 저장하고, 앱에서 볼 주소를 만든다. */
@Component
public class FileStorage {

    private static final Logger log = LoggerFactory.getLogger(FileStorage.class);
    private static final Set<String> ALLOWED = Set.of("jpg", "jpeg", "png", "webp", "heic");
    /** 첨부할 수 있는 문서 종류 */
    public static final Set<String> DOC_ALLOWED = Set.of(
            "pdf", "xls", "xlsx", "csv", "hwp", "hwpx", "doc", "docx", "ppt", "pptx", "txt", "zip");

    private final Path dir;

    public FileStorage(@Value("${buildup.upload-dir}") String uploadDir) throws IOException {
        this.dir = Path.of(uploadDir).toAbsolutePath();
        Files.createDirectories(dir);
    }

    /** 저장하고 파일 이름을 돌려준다 */
    public String save(MultipartFile file) {
        String original = file.getOriginalFilename() == null ? "" : file.getOriginalFilename();
        String ext = original.contains(".")
                ? original.substring(original.lastIndexOf('.') + 1).toLowerCase()
                : "jpg";
        if (!ALLOWED.contains(ext)) {
            throw ApiException.badRequest("사진 파일(jpg, png)만 올릴 수 있어요.");
        }
        String name = UUID.randomUUID() + "." + ext;
        try {
            file.transferTo(dir.resolve(name));
        } catch (IOException e) {
            throw new IllegalStateException("사진 저장 실패", e);
        }
        return name;
    }

    /** DB 작업이 성공(커밋)한 뒤에 파일을 지운다(실패로 되돌려지면 파일도 그대로) */
    public void deleteAfterCommit(List<String> photos, List<ReportFile> docs) {
        List<String> p = List.copyOf(photos);
        List<ReportFile> d = List.copyOf(docs);
        if (org.springframework.transaction.support.TransactionSynchronizationManager.isSynchronizationActive()) {
            org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(
                    new org.springframework.transaction.support.TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            deleteAll(p);
                            deleteDocuments(d);
                        }
                    });
        } else {
            deleteAll(p);
            deleteDocuments(d);
        }
    }

    public void deleteAll(List<String> names) {
        for (String name : names) {
            try {
                Files.deleteIfExists(dir.resolve(name));
            } catch (IOException e) {
                log.warn("사진 삭제 실패: {}", name, e);
            }
        }
    }

    /** 첨부할 수 있는 문서 형식인지 미리 확인 */
    public static void checkDocument(MultipartFile file) {
        String original = file.getOriginalFilename() == null ? "" : file.getOriginalFilename();
        String ext = original.contains(".") ? original.substring(original.lastIndexOf('.') + 1).toLowerCase() : "";
        if (!DOC_ALLOWED.contains(ext)) {
            throw ApiException.badRequest("엑셀·PDF·한글·워드·파워포인트 파일만 첨부할 수 있어요. (" + original + ")");
        }
    }

    /** 문서 저장: docs/무작위폴더/원래이름 으로 저장해 내려받을 때 원래 이름이 그대로 보이게 한다 */
    public ReportFile saveDocument(MultipartFile file) {
        String original = file.getOriginalFilename() == null ? "" : file.getOriginalFilename();
        // 경로 문자 제거(다른 폴더에 쓰지 못하게)
        String name = original.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
        if (name.isEmpty() || name.startsWith(".")) {
            name = "file" + name;
        }
        if (name.length() > 150) {
            name = name.substring(name.length() - 150);
        }
        String ext = name.contains(".") ? name.substring(name.lastIndexOf('.') + 1).toLowerCase() : "";
        if (!DOC_ALLOWED.contains(ext)) {
            throw ApiException.badRequest("엑셀·PDF·한글·워드·파워포인트 파일만 첨부할 수 있어요. (" + original + ")");
        }
        String folder = UUID.randomUUID().toString();
        String path = "docs/" + folder + "/" + name;
        try {
            Path target = dir.resolve(path).normalize();
            if (!target.startsWith(dir)) {
                throw ApiException.badRequest("파일 이름이 올바르지 않아요.");
            }
            Files.createDirectories(target.getParent());
            file.transferTo(target);
        } catch (IOException e) {
            throw new IllegalStateException("파일 저장 실패", e);
        }
        return new ReportFile(path, name, file.getSize());
    }

    public void deleteDocuments(List<ReportFile> docs) {
        for (ReportFile f : docs) {
            try {
                Path p = dir.resolve(f.getPath()).normalize();
                Files.deleteIfExists(p);
                Files.deleteIfExists(p.getParent());
            } catch (IOException e) {
                log.warn("첨부 파일 삭제 실패: {}", f.getPath(), e);
            }
        }
    }

    /** 문서 주소(한글 파일 이름은 주소용 글자로 바꿔 준다) */
    public static String docUrl(String path) {
        return ServletUriComponentsBuilder.fromCurrentContextPath()
                .path("/files/")
                .pathSegment(path.split("/"))
                .build()
                .encode()
                .toUriString();
    }

    /** 요청을 보낸 기기가 접속한 주소 기준 URL (예: http://10.0.2.2:8080/files/abc.jpg) */
    public static String url(String name) {
        return ServletUriComponentsBuilder.fromCurrentContextPath()
                .path("/files/")
                .path(name)
                .toUriString();
    }
}
