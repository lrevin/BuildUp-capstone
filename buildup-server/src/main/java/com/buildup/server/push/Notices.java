package com.buildup.server.push;

import com.buildup.server.material.MaterialItem;
import com.buildup.server.material.MaterialRequest;
import com.buildup.server.report.Report;
import com.buildup.server.site.Site;
import com.buildup.server.user.User;
import com.buildup.server.user.UserRepository;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 어떤 일이 생기면 누구에게 어떤 알림을 보낼지.
 *   새 보고      → 현장 총관리자 + 연결된 본사 관계자 (보고한 본인 제외)
 *   새 자재 요청 → 승인할 수 있는 사람: 현장 총관리자 + 연결된 본사 관계자 (요청한 본인 제외)
 *   승인·반려    → 요청한 사람
 */
@Component
@RequiredArgsConstructor
public class Notices {

    private final PushService push;
    private final UserRepository users;

    public void reportCreated(Report r) {
        Site site = r.getSite();
        Set<Long> to = managers(site);
        to.remove(r.getAuthor().getId());
        String body = r.getAuthor().getName() + " · " + r.workText() + " · 진행률 "
                + pct(r.getFromProgress()) + " → " + pct(r.getToProgress());
        push.notifyUsers(to, "새 현장 보고 · " + site.getName(), body, data("report", site));
    }

    /** 승인·보완 요청 → 보고한 사람 */
    public void reportReviewed(Report r) {
        boolean ok = Report.APPROVED.equals(r.status());
        String comment = r.lastReview() == null ? null : r.lastReview().getComment();
        String body = r.workText() + " " + pct(r.getToProgress())
                + (comment == null ? "" : " · " + comment);
        push.notifyUsers(
                List.of(r.getAuthor().getId()),
                (ok ? "보고 승인 · " : "보완 요청 · ") + r.getSite().getName(),
                body,
                data("report", r.getSite()));
    }

    /** 보완해서 다시 올림 → 보완을 요청한 사람(없으면 검토할 수 있는 사람들) */
    public void reportResubmitted(Report r) {
        Set<Long> to = new LinkedHashSet<>();
        if (r.lastReview() != null) {
            to.add(r.lastReview().getReviewer().getId());
        } else {
            to.addAll(managers(r.getSite()));
        }
        to.remove(r.getAuthor().getId());
        push.notifyUsers(to, "보완 완료 · " + r.getSite().getName(),
                r.getAuthor().getName() + " · " + r.workText() + " 보고를 보완했어요", data("report", r.getSite()));
    }

    public void materialRequested(MaterialRequest m) {
        if (!MaterialRequest.REQUESTED.equals(m.getStatus())) {
            return; // 바로 승인된 요청(본사 없는 현장의 총관리자 본인 요청)은 알릴 사람이 없다
        }
        Site site = m.getSite();
        Set<Long> to = managers(site);
        to.remove(m.getAuthor().getId());
        String title = (m.isUrgent() ? "긴급 자재 요청 · " : "자재 요청 · ") + site.getName();
        push.notifyUsers(to, title, m.getAuthor().getName() + " · " + items(m.getItems()), data("material", site));
    }

    public void materialDecided(MaterialRequest m, User decider) {
        if (m.getAuthor().getId().equals(decider.getId())) {
            return;
        }
        boolean ok = MaterialRequest.APPROVED.equals(m.getStatus());
        String body = items(m.getItems());
        if (!ok && m.getRejectReason() != null) {
            body += " · 사유: " + m.getRejectReason();
        }
        push.notifyUsers(
                List.of(m.getAuthor().getId()),
                (ok ? "자재 요청 승인 · " : "자재 요청 반려 · ") + m.getSite().getName(),
                body,
                data("material", m.getSite()));
    }

    /** 현장 총관리자 + 이 현장이 연결된 본사의 관계자 */
    private Set<Long> managers(Site site) {
        Set<Long> ids = new LinkedHashSet<>();
        ids.add(site.getOwner().getId());
        if (site.getCompany() != null) {
            users.findByHqCompanyIdOrderById(site.getCompany().getId()).forEach(u -> ids.add(u.getId()));
        }
        return ids;
    }

    private static Map<String, String> data(String type, Site site) {
        return Map.of("type", type, "siteId", String.valueOf(site.getId()), "siteName", site.getName());
    }

    private static String items(List<MaterialItem> items) {
        if (items.isEmpty()) {
            return "";
        }
        MaterialItem first = items.get(0);
        String qty = first.getQuantity() == Math.rint(first.getQuantity())
                ? String.valueOf((long) first.getQuantity())
                : String.valueOf(first.getQuantity());
        String s = first.getName() + " " + qty + first.getUnit();
        return items.size() > 1 ? s + " 외 " + (items.size() - 1) + "건" : s;
    }

    private static String pct(double v) {
        return String.format("%.1f%%", v);
    }
}
