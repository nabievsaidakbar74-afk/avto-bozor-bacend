import { UserRole } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { AppError } from "../../src/common/errors/app-error.js";
import { assertCanChangeUserStatus, canChangeUserStatus } from "../../src/common/security/role-hierarchy.js";

describe("role hierarchy", () => {
  it("lets an admin change users and moderators only", () => {
    expect(canChangeUserStatus(UserRole.ADMIN, UserRole.USER)).toBe(true);
    expect(canChangeUserStatus(UserRole.ADMIN, UserRole.MODERATOR)).toBe(true);
    expect(canChangeUserStatus(UserRole.ADMIN, UserRole.ADMIN)).toBe(false);
    expect(canChangeUserStatus(UserRole.ADMIN, UserRole.SUPER_ADMIN)).toBe(false);
    expect(canChangeUserStatus(UserRole.USER, UserRole.USER)).toBe(false);
    expect(canChangeUserStatus(UserRole.MODERATOR, UserRole.USER)).toBe(false);
  });

  it("lets a super admin change other accounts, including admins", () => {
    expect(canChangeUserStatus(UserRole.SUPER_ADMIN, UserRole.ADMIN)).toBe(true);
    expect(canChangeUserStatus(UserRole.SUPER_ADMIN, UserRole.SUPER_ADMIN)).toBe(true);
  });

  it("rejects changing your own status", () => {
    expect(() => {
      assertCanChangeUserStatus(
        { id: "same", role: UserRole.SUPER_ADMIN },
        { id: "same", role: UserRole.SUPER_ADMIN },
      );
    }).toThrow(AppError);
  });
});
