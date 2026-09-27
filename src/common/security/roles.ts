export const RoleName = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",
  MODERATOR: "MODERATOR",
  USER: "USER",
} as const;

export type RoleName = (typeof RoleName)[keyof typeof RoleName];

export const ROLES = [
  RoleName.SUPER_ADMIN,
  RoleName.ADMIN,
  RoleName.MODERATOR,
  RoleName.USER,
] as const;

export function isRoleName(value: unknown): value is RoleName {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
