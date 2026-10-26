package com.buildup.server.material;

import com.buildup.server.common.ApiException;
import com.buildup.server.common.Times;
import com.buildup.server.material.MaterialDtos.CreateRequest;
import com.buildup.server.material.MaterialDtos.MaterialItemDto;
import com.buildup.server.material.MaterialDtos.MaterialRequestDto;
import com.buildup.server.material.MaterialDtos.Permissions;
import com.buildup.server.push.Notices;
import com.buildup.server.site.Site;
import com.buildup.server.site.SiteProcess;
import com.buildup.server.site.SiteService;
import com.buildup.server.user.User;
import com.buildup.server.user.UserRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 자재 요청·승인·반려 (권한 규칙은 앱 src/data/dummy.ts와 같다)
 *   작업자 요청 → 현장 총관리자 또는 본사 관계자가 승인/반려
 *   총관리자 본인 요청 → 본사 연결 현장이면 본사가 처리, 아니면 바로 승인
 */
@Service
@RequiredArgsConstructor
public class MaterialService {

    public static final int MAX_ITEMS = 20;

    private final MaterialRequestRepository materials;
    private final UserRepository users;
    private final SiteService sites;
    private final Notices notices;

    private User user(Long userId) {
        return users.findById(userId).orElseThrow(() -> ApiException.unauthorized("로그인이 필요합니다."));
    }

    @Transactional(readOnly = true)
    public List<MaterialRequestDto> list(Long userId, Long siteId) {
        sites.viewableSite(userId, siteId);
        User viewer = user(userId);
        return materials.findBySiteIdOrderByCreatedAtDescIdDesc(siteId).stream()
                .map(m -> MaterialRequestDto.of(m, viewer))
                .toList();
    }

    /** 본사 화면: 연결된 현장들의 요청 전체 */
    @Transactional(readOnly = true)
    public List<MaterialRequestDto> listForSites(Long userId, List<Long> siteIds) {
        if (siteIds.isEmpty()) {
            return List.of();
        }
        User viewer = user(userId);
        return materials.findBySiteIdInOrderByCreatedAtDescIdDesc(siteIds).stream()
                .map(m -> MaterialRequestDto.of(m, viewer))
                .toList();
    }

    @Transactional
    public MaterialRequestDto create(Long userId, Long siteId, CreateRequest req) {
        Site site = sites.memberSite(userId, siteId);
        User author = user(userId);
        MaterialRequest m = new MaterialRequest();
        m.setSite(site);

        if (req.processKey() != null && !req.processKey().isBlank()) {
            SiteProcess process = site.getProcesses().stream()
                    .filter(p -> p.getKey().equals(req.processKey()))
                    .findFirst()
                    .orElseThrow(() -> ApiException.badRequest("존재하지 않는 공정입니다."));
            m.setProcessKey(process.getKey());
            m.setProcessName(process.getName());
        }

        m.setItems(new ArrayList<>(validItems(req.items())));

        LocalDate neededBy = Times.parseYmd(req.neededBy());
        if (neededBy != null && neededBy.isBefore(Times.today())) {
            throw ApiException.badRequest("필요일은 오늘 이후로 정해 주세요.");
        }
        m.setNeededBy(neededBy);
        m.setUrgent(Boolean.TRUE.equals(req.urgent()));

        String note = req.note() == null ? "" : req.note().trim();
        if (note.length() > 500) {
            throw ApiException.badRequest("요청 메모는 500자까지 쓸 수 있어요.");
        }
        m.setNote(note);
        m.setAuthor(author);
        Instant now = Instant.now();
        m.setCreatedAt(now);
        m.addEvent(MaterialRequest.REQUESTED, author, false, now);
        // 본사에 연결되지 않은 현장의 총관리자가 직접 요청하면 스스로 승인할 필요 없이 바로 승인
        // (연결된 현장이면 본사가 승인·반려한다)
        if (site.isOwner(userId) && site.getCompany() == null) {
            m.setStatus(MaterialRequest.APPROVED);
            m.addEvent(MaterialRequest.APPROVED, author, false, now);
        }
        materials.save(m);
        notices.materialRequested(m);
        return MaterialRequestDto.of(m, author);
    }

    private List<MaterialItem> validItems(List<MaterialItemDto> items) {
        List<MaterialItem> result = new ArrayList<>();
        if (items != null) {
            for (MaterialItemDto i : items) {
                if (i == null) {
                    continue;
                }
                String name = i.name() == null ? "" : i.name().trim();
                if (name.isEmpty()) {
                    continue; // 빈 줄은 무시
                }
                if (name.length() > 50) {
                    throw ApiException.badRequest("자재 이름은 50자까지 쓸 수 있어요.");
                }
                double qty = i.quantity() == null ? 0 : i.quantity();
                if (qty <= 0 || qty > 1_000_000) {
                    throw ApiException.badRequest(name + "의 수량을 확인해 주세요.");
                }
                String unit = i.unit() == null ? "" : i.unit().trim();
                if (unit.length() > 10) {
                    throw ApiException.badRequest("단위는 10자까지 쓸 수 있어요.");
                }
                result.add(new MaterialItem(name, Math.round(qty * 100) / 100.0, unit));
            }
        }
        if (result.isEmpty()) {
            throw ApiException.badRequest("요청할 자재를 1개 이상 입력해 주세요.");
        }
        if (result.size() > MAX_ITEMS) {
            throw ApiException.badRequest("자재는 한 번에 " + MAX_ITEMS + "개까지 요청할 수 있어요.");
        }
        return result;
    }

    /** 총관리자·본사 관계자: 승인 / 반려(사유) */
    @Transactional
    public MaterialRequestDto changeStatus(Long userId, Long requestId, String status, String reason) {
        MaterialRequest m = find(userId, requestId);
        User viewer = user(userId);
        Site site = m.getSite();
        boolean hq = site.isHqManagerOf(viewer);
        if (!site.isOwner(userId) && !hq) {
            throw ApiException.forbidden("현장 관리자나 본사 관리자만 자재 요청을 처리할 수 있습니다.");
        }
        String next = status == null ? "" : status;
        if (!MaterialRequest.APPROVED.equals(next) && !MaterialRequest.REJECTED.equals(next)) {
            throw ApiException.badRequest("상태 값이 올바르지 않습니다.");
        }
        if (!Permissions.of(m, viewer).canDecide()) {
            throw ApiException.conflict(MaterialRequest.REQUESTED.equals(m.getStatus())
                    ? "본인이 요청한 자재는 본사에서 승인해요."
                    : "이미 처리된 요청이에요. 목록을 새로고침해 주세요.");
        }
        String r = reason == null ? "" : reason.trim();
        m.setRejectReason(MaterialRequest.REJECTED.equals(next) && !r.isEmpty()
                ? r.substring(0, Math.min(r.length(), 100))
                : null);
        m.setStatus(next);
        m.addEvent(next, viewer, hq && !site.isOwner(userId), Instant.now());
        notices.materialDecided(m, viewer);
        return MaterialRequestDto.of(m, viewer);
    }

    /** 작성자: 아직 처리되지 않은 요청만 취소 */
    @Transactional
    public void cancel(Long userId, Long requestId) {
        MaterialRequest m = find(userId, requestId);
        if (!Permissions.of(m, user(userId)).canCancel()) {
            throw ApiException.forbidden("처리 전인 본인 요청만 취소할 수 있습니다.");
        }
        materials.delete(m);
    }

    private MaterialRequest find(Long userId, Long requestId) {
        MaterialRequest m = materials.findById(requestId)
                .orElseThrow(() -> ApiException.notFound("자재 요청을 찾을 수 없습니다."));
        sites.viewableSite(userId, m.getSite().getId());
        return m;
    }
}
