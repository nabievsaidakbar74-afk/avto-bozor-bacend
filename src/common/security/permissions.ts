import { RoleName, type RoleName as RoleNameValue } from "./roles.js";

export const Permission = {
  USER_READ: "USER_READ",
  USER_UPDATE: "USER_UPDATE",
  USER_DELETE: "USER_DELETE",
  USER_BLOCK: "USER_BLOCK",
  CAR_CREATE: "CAR_CREATE",
  CAR_READ: "CAR_READ",
  CAR_UPDATE: "CAR_UPDATE",
  CAR_DELETE: "CAR_DELETE",
  LISTING_CREATE: "LISTING_CREATE",
  LISTING_UPDATE: "LISTING_UPDATE",
  LISTING_DELETE: "LISTING_DELETE",
  LISTING_MODERATE: "LISTING_MODERATE",
  SALE_READ: "SALE_READ",
  SALE_CREATE: "SALE_CREATE",
  RENTAL_CREATE: "RENTAL_CREATE",
  RENTAL_READ: "RENTAL_READ",
  BOOKING_CREATE: "BOOKING_CREATE",
  BOOKING_UPDATE: "BOOKING_UPDATE",
  PAYMENT_READ: "PAYMENT_READ",
  FAVORITE_MANAGE: "FAVORITE_MANAGE",
  REVIEW_CREATE: "REVIEW_CREATE",
  NOTIFICATION_READ: "NOTIFICATION_READ",
  REPORT_READ: "REPORT_READ",
  REPORT_MODERATE: "REPORT_MODERATE",
  AUDIT_READ: "AUDIT_READ",
  DASHBOARD_READ: "DASHBOARD_READ",
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

const userPermissions: readonly Permission[] = [
  Permission.USER_READ,
  Permission.USER_UPDATE,
  Permission.CAR_CREATE,
  Permission.CAR_READ,
  Permission.CAR_UPDATE,
  Permission.CAR_DELETE,
  Permission.LISTING_CREATE,
  Permission.LISTING_UPDATE,
  Permission.LISTING_DELETE,
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
];

const moderatorPermissions: readonly Permission[] = [
  ...userPermissions,
  Permission.LISTING_MODERATE,
  Permission.REPORT_READ,
  Permission.REPORT_MODERATE,
];

const adminPermissions: readonly Permission[] = [
  ...moderatorPermissions,
  Permission.USER_DELETE,
  Permission.USER_BLOCK,
  Permission.AUDIT_READ,
  Permission.DASHBOARD_READ,
];

const rolePermissions: Record<RoleNameValue, readonly Permission[]> = {
  [RoleName.USER]: userPermissions,
  [RoleName.MODERATOR]: moderatorPermissions,
  [RoleName.ADMIN]: adminPermissions,
  [RoleName.SUPER_ADMIN]: Object.values(Permission),
};

export function permissionsForRole(role: RoleNameValue): readonly Permission[] {
  return rolePermissions[role];
}

export function hasPermission(role: RoleNameValue, permission: Permission): boolean {
  if (role === RoleName.SUPER_ADMIN) {
    return true;
  }
  return rolePermissions[role].includes(permission);
}
