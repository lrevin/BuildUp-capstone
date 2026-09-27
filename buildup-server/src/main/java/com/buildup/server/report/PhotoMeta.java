package com.buildup.server.report;

import com.drew.imaging.ImageMetadataReader;
import com.drew.lang.GeoLocation;
import com.drew.metadata.Metadata;
import com.drew.metadata.exif.ExifSubIFDDirectory;
import com.drew.metadata.exif.GpsDirectory;
import java.io.InputStream;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Date;
import java.util.TimeZone;
import org.springframework.web.multipart.MultipartFile;

/**
 * 사진 파일에 들어 있는 촬영 정보(EXIF) 읽기.
 * 휴대폰 카메라는 보통 촬영 시각을 넣고, 위치 기록을 켜 두면 GPS도 넣는다. 없으면 null.
 */
final class PhotoMeta {

    private PhotoMeta() {}

    record Info(Instant takenAt, Double latitude, Double longitude) {
        static final Info EMPTY = new Info(null, null, null);
    }

    static Info read(MultipartFile file) {
        try (InputStream in = file.getInputStream()) {
            Metadata m = ImageMetadataReader.readMetadata(in);
            Instant taken = null;
            ExifSubIFDDirectory exif = m.getFirstDirectoryOfType(ExifSubIFDDirectory.class);
            if (exif != null) {
                // EXIF 시각에는 시간대가 없다 → 한국 시간으로 본다(시간대 태그가 있으면 그것을 쓴다)
                Date d = exif.getDateOriginal(TimeZone.getTimeZone("Asia/Seoul"));
                if (d != null) {
                    taken = d.toInstant();
                }
            }
            Double lat = null;
            Double lng = null;
            GpsDirectory gps = m.getFirstDirectoryOfType(GpsDirectory.class);
            if (gps != null) {
                GeoLocation g = gps.getGeoLocation();
                if (g != null && !g.isZero()) {
                    lat = g.getLatitude();
                    lng = g.getLongitude();
                }
            }
            return new Info(sane(taken), lat, lng);
        } catch (Exception e) {
            return Info.EMPTY; // 사진이 아니거나 정보가 없음
        }
    }

    /** 앱이 알려 준 촬영 시각(ISO). 이상한 값은 버린다 */
    static Instant parse(String iso) {
        if (iso == null || iso.isBlank()) {
            return null;
        }
        try {
            return sane(Instant.parse(iso));
        } catch (Exception e) {
            try {
                return sane(LocalDateTime.parse(iso).toInstant(ZoneOffset.ofHours(9)));
            } catch (Exception ignored) {
                return null;
            }
        }
    }

    /** 2000년 이전이나 지금보다 하루 이상 미래인 시각은 믿지 않는다 */
    private static Instant sane(Instant t) {
        if (t == null) {
            return null;
        }
        if (t.isBefore(Instant.parse("2000-01-01T00:00:00Z")) || t.isAfter(Instant.now().plusSeconds(86_400))) {
            return null;
        }
        return t;
    }

    /** 두 지점 사이 거리(m) */
    static double distance(double lat1, double lng1, double lat2, double lng2) {
        double r = 6_371_000;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 2 * r * Math.asin(Math.sqrt(a));
    }
}
