import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { AppError } from "../../src/common/errors/app-error.js";
import { signAccessToken, verifyAccessToken } from "../../src/common/security/jwt.js";
import { RoleName } from "../../src/common/security/roles.js";
import { env } from "../../src/config/env.js";

describe("access tokens", () => {
  it("round-trips a signed token", () => {
    const token = signAccessToken({
      sub: "6d9f0c2e-1b3a-4c5d-8e7f-123456789abc",
      role: RoleName.USER,
    });

    expect(verifyAccessToken(token)).toEqual({
      sub: "6d9f0c2e-1b3a-4c5d-8e7f-123456789abc",
      role: RoleName.USER,
    });
  });

  it("rejects an expired token", () => {
    const token = jwt.sign(
      { sub: "6d9f0c2e-1b3a-4c5d-8e7f-123456789abc", role: RoleName.USER },
      env.JWT_SECRET,
      { algorithm: "HS256", expiresIn: "-1s" },
    );

    expect(() => verifyAccessToken(token)).toThrow(AppError);
  });

  it("rejects a token with an unknown role", () => {
    const token = jwt.sign(
      { sub: "6d9f0c2e-1b3a-4c5d-8e7f-123456789abc", role: "GUEST" },
      env.JWT_SECRET,
      { algorithm: "HS256", expiresIn: "5m" },
    );

    expect(() => verifyAccessToken(token)).toThrow(AppError);
  });
});
