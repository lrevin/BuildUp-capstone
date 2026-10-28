package com.buildup.server.site;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;

/** 현장 관련 요청/응답 모양(앱 src/types.ts와 같음) */
public final class SiteDtos {

    private SiteDtos() {}

    // ---- 응답 ----

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
            String workType,
            String lastReportedAt,
            String hqName,
            Double latitude,
            Double longitude,
            String progressMode,
            List<ProcessDto> processes,
            List<SiteMaterialDto> materials) {}

    /** 현장 자재 재고 한 줄: 남은 양 */
    public record SiteMaterialDto(String name, double quantity, String unit, String updatedAt) {}

    /** 공정: weight는 가중치(%), progress는 공정별 진행률(%) */
    public record ProcessDto(String key, String name, double weight, double progress, String lastReportedAt) {}

    /** 현장 목록 카드 */
    public record SiteSummaryDto(
            String id,
            String name,
            String address,
            String ownerName,
            int memberCount,
            double overallProgress,
            boolean isOwner,
            String workType,
            String lastReportedAt,
            String hqName,
            int pendingMaterials,
            int pendingReviews,
            String progressMode) {}

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
            String address,
            @Size(max = 50, message = "공사 종류는 50자까지 쓸 수 있어요.") String workType,
            String progressMode,
            List<ProcessInput> processes,
            List<MaterialInput> materials) {}

    /** 현장 자재 입력: 이름 · 지금 있는 양 · 단위 */
    public record MaterialInput(String name, Double quantity, String unit) {}

    /** 현장 자재 재고 바꾸기(최고 책임자): { materials: [...] } 목록 전체를 이 값으로 */
    public record MaterialsRequest(List<MaterialInput> materials) {}

    /** 공정 입력: key가 없으면 새 공정. weight는 가중치(%) */
    public record ProcessInput(String key, String name, Double weight) {}

    /** 진행률 계산 방식 바꾸기: { mode: manual | auto, processes } (auto면 공정 필수, 가중치 합 100) */
    public record ProgressModeRequest(String mode, List<ProcessInput> processes) {}

    public record JoinRequest(
            @NotBlank(message = "참여 코드를 입력해 주세요.")
            @Pattern(regexp = "\\d{6}", message = "참여 코드는 6자리 숫자예요.")
            String code) {}

    public record CompanyCodeRequest(String code) {}

    public record CompanyPreviewDto(String name) {}
}
