import { UserRole } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { ROLES } from "../../src/common/security/roles.js";

describe("role catalog", () => {
  it("matches the Prisma UserRole enum", () => {
    expect([...ROLES].sort()).toEqual([...Object.values(UserRole)].sort());
  });
});
