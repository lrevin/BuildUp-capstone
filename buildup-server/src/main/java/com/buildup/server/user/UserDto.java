package com.buildup.server.user;

/**
 * 앱의 User 타입과 같은 모양.
 *   본사 관계자: company = 본사명, companyCode = 본사 코드
 *   현장 관리자: company = 회사·사무소명, hqName = 보고하는 본사(없으면 null = 최고 책임자)
 */
public record UserDto(
        String id,
        String name,
        String email,
        String phone,
        String role,
        String company,
        String companyCode,
        String hqName) {

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
                u.getRole() == Role.ADMIN && u.getManagerCompany() != null ? u.getManagerCompany().getName() : null);
    }
}
