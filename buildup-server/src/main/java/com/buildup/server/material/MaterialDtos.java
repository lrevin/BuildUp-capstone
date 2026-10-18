package com.buildup.server.material;

import com.buildup.server.common.Times;
import com.buildup.server.site.Site;
import com.buildup.server.user.User;
import java.util.List;

/** 자재 요청 요청/응답 모양(앱 src/types.ts의 MaterialRequest와 같음) */
public final class MaterialDtos {

    private MaterialDtos() {}

    public record MaterialItemDto(String name, Double quantity, String unit) {

        static MaterialItemDto of(MaterialItem i) {
            return new MaterialItemDto(i.getName(), i.getQuantity(), i.getUnit());
        }
    }

    public record EventDto(String status, String by, boolean byHq, String at) {

        static EventDto of(MaterialEvent e) {
            return new EventDto(e.getStatus(), e.getActor(), e.isByHq(), Times.iso(e.getAt()));
        }
    }

    /**
     * 로그인한 사람이 이 요청에 할 수 있는 처리.
     * 승인·반려: 현장 총관리자 또는 연결된 본사 관계자.
     * 단, 본사에 연결된 현장에서 총관리자가 직접 요청한 것은 본사가 처리한다.
     */
    public record Permissions(boolean canCancel, boolean canDecide) {

        static Permissions of(MaterialRequest m, User viewer) {
            Site site = m.getSite();
            boolean owner = site.isOwner(viewer.getId());
            boolean hq = site.isHqManagerOf(viewer);
            boolean linked = site.getCompany() != null;
            boolean author = m.getAuthor().getId().equals(viewer.getId());
            boolean requested = MaterialRequest.REQUESTED.equals(m.getStatus());
            return new Permissions(
                    author && requested,
                    requested && (hq || (owner && !(author && linked))));
        }
    }

    public record MaterialRequestDto(
            String id,
            String siteId,
            String siteName,
            String processKey,
            String processName,
            List<MaterialItemDto> items,
            String neededBy,
            boolean urgent,
            String note,
            String status,
            String rejectReason,
            String author,
            String authorId,
            String createdAt,
            List<EventDto> timeline,
            boolean hqLinked,
            boolean canCancel,
            boolean canApprove,
            boolean canReject) {

        static MaterialRequestDto of(MaterialRequest m, User viewer) {
            Permissions p = Permissions.of(m, viewer);
            return new MaterialRequestDto(
                    String.valueOf(m.getId()),
                    String.valueOf(m.getSite().getId()),
                    m.getSite().getName(),
                    m.getProcessKey(),
                    m.getProcessName(),
                    m.getItems().stream().map(MaterialItemDto::of).toList(),
                    Times.ymd(m.getNeededBy()),
                    m.isUrgent(),
                    m.getNote(),
                    m.getStatus(),
                    m.getRejectReason(),
                    m.getAuthor().getName(),
                    String.valueOf(m.getAuthor().getId()),
                    Times.iso(m.getCreatedAt()),
                    m.getEvents().stream().map(EventDto::of).toList(),
                    m.getSite().getCompany() != null,
                    p.canCancel(),
                    p.canDecide(),
                    p.canDecide());
        }
    }

    public record CreateRequest(
            String processKey, List<MaterialItemDto> items, String neededBy, Boolean urgent, String note) {}

    /** status: approved | rejected. reason은 반려 때만. */
    public record StatusRequest(String status, String reason) {}
}
