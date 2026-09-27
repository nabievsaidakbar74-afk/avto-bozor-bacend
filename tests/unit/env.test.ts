import { describe, expect, it } from "vitest";
import { envSchema } from "../../src/config/env.js";

const validSecret = "test-access-secret-must-be-32-characters";
const validRefreshSecret = "test-refresh-secret-must-be-32-characters";

describe("envSchema", () => {
  it("accepts a PostgreSQL URL and applies defaults", () => {
    const parsed = envSchema.safeParse({
      DATABASE_URL: "postgresql://postgres:secret@127.0.0.1:5432/avto_bozor?schema=public",
      JWT_SECRET: validSecret,
      JWT_REFRESH_SECRET: validRefreshSecret,
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.PORT).toBe(3000);
      expect(parsed.data.NODE_ENV).toBe("development");
      expect(parsed.data.TRUST_PROXY).toBe(false);
    }
  });

  it("rejects a missing database URL and a short JWT secret", () => {
    const parsed = envSchema.safeParse({
      JWT_SECRET: "too-short",
      JWT_REFRESH_SECRET: validRefreshSecret,
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects non-PostgreSQL connection strings", () => {
    const parsed = envSchema.safeParse({
      DATABASE_URL: "mysql://root:secret@127.0.0.1:3306/avto_bozor",
      JWT_SECRET: validSecret,
      JWT_REFRESH_SECRET: validRefreshSecret,
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects a wildcard CORS origin", () => {
    const parsed = envSchema.safeParse({
      DATABASE_URL: "postgresql://postgres:secret@127.0.0.1:5432/avto_bozor?schema=public",
      JWT_SECRET: validSecret,
      JWT_REFRESH_SECRET: validRefreshSecret,
      CORS_ORIGIN: "*",
    });
    expect(parsed.success).toBe(false);
  });
});
