package com.buildup.server.user;

/**
 * 앱의 User 타입과 같은 모양.
 *   본사 관계자: company = 본사명, companyCode = 본사 코드
 *   현장 관리자: company = 회사·사무소명, hqName = 보고하는 본사(없으면 null = 최고 책임자)
 *   role: 'worker' | 'admin' | 'hq' | 'system' (웹 대시보드는 'hq'만 로그인)
 *   hqRole: 본사 관계자만 'manager'(본사 관리자) | 'member'(본사 일반 직원), 나머지는 null
 *   canReviewReports: 본사에서 보고 검토·자재 승인을 할 수 있는가(본사 관리자만 true)
 */
public record UserDto(
        String id,
        String name,
        String email,
        String phone,
        String role,
        String company,
        String companyCode,
        String hqName,
        String hqRole,
        boolean canReviewReports) {

    public static UserDto of(User u) {
        boolean hq = u.getRole() == Role.HQ && u.getHqCompany() != null;
        return new UserDto(
                String.valueOf(u.getId()),
                u.getName(),
                u.getEmail(),
                u.getPhone(),
                u.getRole().api(),
                hq ? u.getHqCompany().getName() : u.getCompany(),
                hq ? u.getHqCompany().getCode() : null,
                u.getRole() == Role.ADMIN && u.getManagerCompany() != null ? u.getManagerCompany().getName() : null,
                hq ? (u.isHqManager() ? "manager" : "member") : null,
                u.isHqManager());
    }
}
