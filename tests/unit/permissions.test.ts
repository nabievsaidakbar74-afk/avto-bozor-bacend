import { describe, expect, it } from "vitest";
import { Permission, hasPermission, permissionsForRole } from "../../src/common/security/permissions.js";
import { RoleName } from "../../src/common/security/roles.js";

const catalog = [
  Permission.USER_READ,
  Permission.USER_UPDATE,
  Permission.USER_DELETE,
  Permission.USER_BLOCK,
  Permission.CAR_CREATE,
  Permission.CAR_READ,
  Permission.CAR_UPDATE,
  Permission.CAR_DELETE,
  Permission.LISTING_CREATE,
  Permission.LISTING_UPDATE,
  Permission.LISTING_DELETE,
  Permission.LISTING_MODERATE,
  Permission.SALE_READ,
  Permission.SALE_CREATE,
  Permission.RENTAL_CREATE,
  Permission.RENTAL_READ,
  Permission.BOOKING_CREATE,
  Permission.BOOKING_UPDATE,
  Permission.PAYMENT_READ,
  Permission.FAVORITE_MANAGE,
  Permission.REVIEW_CREATE,
  Permission.NOTIFICATION_READ,
  Permission.REPORT_READ,
  Permission.REPORT_MODERATE,
  Permission.AUDIT_READ,
  Permission.DASHBOARD_READ,
] as const;

describe("hasPermission", () => {
  it("matches the centralized permission catalog", () => {
    expect(Object.values(Permission).sort()).toEqual([...catalog].sort());
  });

  it("lets a user manage their own marketplace activity", () => {
    expect(hasPermission(RoleName.USER, Permission.LISTING_CREATE)).toBe(true);
    expect(hasPermission(RoleName.USER, Permission.BOOKING_CREATE)).toBe(true);
    expect(hasPermission(RoleName.USER, Permission.USER_UPDATE)).toBe(true);
    expect(hasPermission(RoleName.USER, Permission.USER_BLOCK)).toBe(false);
    expect(hasPermission(RoleName.USER, Permission.LISTING_MODERATE)).toBe(false);
    expect(hasPermission(RoleName.USER, Permission.AUDIT_READ)).toBe(false);
  });

  it("lets a moderator review reports without blocking users", () => {
    expect(hasPermission(RoleName.MODERATOR, Permission.LISTING_MODERATE)).toBe(true);
    expect(hasPermission(RoleName.MODERATOR, Permission.REPORT_READ)).toBe(true);
    expect(hasPermission(RoleName.MODERATOR, Permission.REPORT_MODERATE)).toBe(true);
    expect(hasPermission(RoleName.MODERATOR, Permission.USER_BLOCK)).toBe(false);
    expect(hasPermission(RoleName.MODERATOR, Permission.AUDIT_READ)).toBe(false);
  });

  it("lets an admin manage accounts and a super admin do everything", () => {
    expect(hasPermission(RoleName.ADMIN, Permission.USER_BLOCK)).toBe(true);
    expect(hasPermission(RoleName.ADMIN, Permission.USER_DELETE)).toBe(true);
    expect(hasPermission(RoleName.ADMIN, Permission.AUDIT_READ)).toBe(true);
    expect(hasPermission(RoleName.ADMIN, Permission.DASHBOARD_READ)).toBe(true);
    expect(hasPermission(RoleName.MODERATOR, Permission.DASHBOARD_READ)).toBe(false);
    expect(permissionsForRole(RoleName.SUPER_ADMIN)).toEqual(Object.values(Permission));
    for (const permission of Object.values(Permission)) {
      expect(hasPermission(RoleName.SUPER_ADMIN, permission)).toBe(true);
    }
  });
});
