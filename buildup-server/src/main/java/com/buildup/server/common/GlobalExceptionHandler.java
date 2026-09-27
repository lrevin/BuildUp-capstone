package com.buildup.server.common;

import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/** 모든 오류를 앱이 읽는 { "message": "..." } 형태로 바꾼다. */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    private static ResponseEntity<Map<String, String>> body(HttpStatus status, String message) {
        return ResponseEntity.status(status).body(Map.of("message", message));
    }

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Map<String, String>> api(ApiException e) {
        return body(e.getStatus(), e.getMessage());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>> invalid(MethodArgumentNotValidException e) {
        var error = e.getBindingResult().getFieldErrors().stream().findFirst();
        return body(HttpStatus.BAD_REQUEST,
                error.map(f -> f.getDefaultMessage()).orElse("입력값을 확인해 주세요."));
    }

    // 형식이 틀린 요청(숫자 자리에 글자, 빠진 값, 지원하지 않는 방식 등)은 서버 오류가 아니라 400
    @ExceptionHandler({
        HttpMessageNotReadableException.class,
        MissingServletRequestParameterException.class,
        MethodArgumentTypeMismatchException.class,
        MissingServletRequestPartException.class,
        HttpRequestMethodNotSupportedException.class,
        HttpMediaTypeNotSupportedException.class
    })
    public ResponseEntity<Map<String, String>> unreadable(Exception e) {
        return body(HttpStatus.BAD_REQUEST, "요청 형식이 올바르지 않습니다.");
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, String>> tooLarge(MaxUploadSizeExceededException e) {
        return body(HttpStatus.CONTENT_TOO_LARGE, "파일 용량이 너무 커요. 사진·첨부 파일은 한 개당 20MB까지 올릴 수 있어요.");
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<Map<String, String>> notFound(NoResourceFoundException e) {
        return body(HttpStatus.NOT_FOUND, "요청한 주소를 찾을 수 없습니다.");
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> unknown(Exception e) {
        log.error("처리되지 않은 오류", e);
        return body(HttpStatus.INTERNAL_SERVER_ERROR, "서버에서 오류가 발생했어요. 잠시 후 다시 시도해 주세요.");
    }
}
