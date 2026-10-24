package com.buildup.server.report;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/** 검토 상태: 서버·API는 소문자(pending / approved / revision), DB는 대문자(PENDING / APPROVED / REVISION) */
@Converter
public class ReviewStatusConverter implements AttributeConverter<String, String> {

    @Override
    public String convertToDatabaseColumn(String value) {
        return value == null ? null : value.toUpperCase();
    }

    @Override
    public String convertToEntityAttribute(String value) {
        return value == null ? null : value.toLowerCase();
    }
}
