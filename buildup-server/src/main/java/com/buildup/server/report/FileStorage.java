package com.buildup.server.report;

import com.buildup.server.common.ApiException;
import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

/**
 * 보고 사진·첨부 문서를 저장하고, 앱에서 볼 주소를 만든다.
 * 저장소는 설정으로 고른다: buildup.storage=local(서버 폴더, 기본) | s3(AWS S3)
 */
@Component
public class FileStorage {

    private static final Set<String> ALLOWED = Set.of("jpg", "jpeg", "png", "webp", "heic");
    /** 첨부할 수 있는 문서 종류 */
    public static final Set<String> DOC_ALLOWED = Set.of(
            "pdf", "xls", "xlsx", "csv", "hwp", "hwpx", "doc", "docx", "ppt", "pptx", "txt", "zip");
    private static final Map<String, String> PHOTO_TYPES = Map.of(
            "jpg", "image/jpeg", "jpeg", "image/jpeg", "png", "image/png", "webp", "image/webp", "heic", "image/heic");

    /** 응답(DTO)에서 주소를 만들 때 쓰는 현재 저장소 */
    private static volatile ObjectStore active;

    private final ObjectStore store;

    public FileStorage(
            @Value("${buildup.upload-dir}") String uploadDir,
            @Value("${buildup.storage:local}") String storage,
            @Value("${buildup.s3.bucket:}") String bucket,
            @Value("${buildup.s3.region:ap-northeast-2}") String region,
            @Value("${buildup.s3.prefix:}") String prefix) throws IOException {
        if ("s3".equalsIgnoreCase(storage)) {
            if (bucket.isBlank()) {
                throw new IllegalStateException("buildup.storage=s3이면 buildup.s3.bucket(S3_BUCKET)을 정해 주세요.");
            }
            this.store = new S3ObjectStore(bucket, region, prefix, null);
        } else {
            this.store = new LocalObjectStore(Path.of(uploadDir).toAbsolutePath());
        }
        active = this.store;
    }

    /** 사진 저장하고 파일 이름(key)을 돌려준다 */
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
            store.put(name, file, PHOTO_TYPES.get(ext));
        } catch (IOException | RuntimeException e) {
            throw new IllegalStateException("사진 저장 실패", e);
        }
        return name;
    }

    /** DB 작업이 성공(커밋)한 뒤에 파일을 지운다(실패로 되돌려지면 파일도 그대로) */
    public void deleteAfterCommit(List<String> photos, List<ReportFile> docs) {
        List<String> p = List.copyOf(photos);
        List<ReportFile> d = List.copyOf(docs);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
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
        names.forEach(store::delete);
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
        String path = "docs/" + UUID.randomUUID() + "/" + name;
        try {
            store.put(path, file, file.getContentType() == null ? "application/octet-stream" : file.getContentType());
        } catch (IOException | RuntimeException e) {
            throw new IllegalStateException("파일 저장 실패", e);
        }
        return new ReportFile(path, name, file.getContentType(), file.getSize());
    }

    public void deleteDocuments(List<ReportFile> docs) {
        docs.forEach(f -> store.delete(f.key()));
    }

    /** 문서 주소(내려받을 때 원래 이름 그대로) */
    public static String docUrl(String path) {
        String name = path.substring(path.lastIndexOf('/') + 1);
        return active.url(path, name);
    }

    /** 사진 주소 */
    public static String url(String name) {
        return active.url(name, null);
    }
}
