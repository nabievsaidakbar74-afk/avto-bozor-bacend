import { describe, expect, it } from "vitest";
import { AppError } from "../../src/common/errors/app-error.js";
import { hashPassword, verifyPassword } from "../../src/common/security/password.js";

describe("password hashing", () => {
  it("verifies an Argon2id hash and rejects a different password", async () => {
    const hash = await hashPassword("correct-horse1");

    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(hash, "correct-horse1")).toBe(true);
    expect(await verifyPassword(hash, "wrong-password1")).toBe(false);
  });

  it("rejects passwords outside the length policy", async () => {
    await expect(hashPassword("short")).rejects.toBeInstanceOf(AppError);
  });

  it("returns false for a malformed hash", async () => {
    expect(await verifyPassword("not-a-hash", "correct-horse")).toBe(false);
  });
});
