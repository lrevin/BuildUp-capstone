package com.buildup.server.site;

import com.buildup.server.common.Times;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;

/** 현장 관련 요청/응답 모양(앱 src/types.ts와 같음) */
public final class SiteDtos {

    private SiteDtos() {}

    // ---- 응답 ----

    public record ProcessDto(
            String key,
            String name,
            double weight,
            double progress,
            String lastReportedAt,
            String planStart,
            String planEnd) {

        static ProcessDto of(SiteProcess p) {
            return new ProcessDto(
                    p.getKey(),
                    p.getName(),
                    p.getWeight(),
                    p.getProgress(),
                    Times.iso(p.getLastReportedAt()),
                    Times.ymd(p.getPlanStart()),
                    Times.ymd(p.getPlanEnd()));
        }
    }

    /** 현장 상세. code는 총관리자에게만 내려준다(작업자는 null). */
    public record SiteDto(
            String id,
            String name,
            String address,
            String ownerId,
            String ownerName,
            String code,
            int memberCount,
            double overallProgress,
            List<ProcessDto> processes,
            String hqName,
            Double latitude,
            Double longitude) {}

    /** 현장 목록 카드 */
    public record SiteSummaryDto(
            String id,
            String name,
            String address,
            String ownerName,
            int memberCount,
            double overallProgress,
            boolean isOwner,
            int todayReported,
            int processCount,
            Double plannedProgress,
            String hqName,
            int pendingMaterials,
            int pendingReviews) {}

    /** 코드 입력 후 참여 전 미리보기 */
    public record SitePreviewDto(
            String id, String name, String address, String ownerName, int memberCount, boolean alreadyJoined) {}

    public record MemberDto(
            String id,
            String name,
            String phone,
            String role,
            boolean isOwner,
            String joinedAt,
            long reportCount) {}

    public record CodeDto(String code) {}

    /** 현장 위치 저장: { latitude, longitude } (둘 다 null이면 지우기) */
    public record LocationRequest(Double latitude, Double longitude) {}

    // ---- 요청 ----

    public record SiteRequest(
            @NotBlank(message = "현장명을 입력해 주세요.") @Size(max = 100, message = "현장명이 너무 길어요.") String name,
            @NotBlank(message = "현장 주소를 입력해 주세요.") @Size(max = 200, message = "주소가 너무 길어요.")
            String address) {}

    public record JoinRequest(
            @NotBlank(message = "참여 코드를 입력해 주세요.")
            @Pattern(regexp = "\\d{6}", message = "참여 코드는 6자리 숫자예요.")
            String code) {}

    public record PlanItem(String key, String planStart, String planEnd) {}

    /** 공정 관리: key가 없으면 새 공정. 목록 순서가 곧 화면 순서 */
    public record ProcessInput(String key, String name, Double weight, String planStart, String planEnd) {}

    public record CompanyCodeRequest(String code) {}

    public record CompanyPreviewDto(String name) {}
}
