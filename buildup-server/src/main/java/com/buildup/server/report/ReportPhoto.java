package com.buildup.server.report;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import java.time.Instant;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 보고 사진 1장 + 촬영 정보(촬영 시각·위치). 촬영 정보는 없을 수도 있다. */
@Embeddable
@Getter
@NoArgsConstructor
@AllArgsConstructor
public class ReportPhoto {

    /** uploads 폴더 기준 파일 이름 */
    @Column(name = "file_name", nullable = false, length = 100)
    private String fileName;

    /** 촬영 시각(사진 EXIF 또는 앱이 알려 준 값) */
    @Column(name = "taken_at")
    private Instant takenAt;

    /** 촬영 위치(사진 EXIF의 GPS) */
    @Column(name = "latitude")
    private Double latitude;

    @Column(name = "longitude")
    private Double longitude;
}
