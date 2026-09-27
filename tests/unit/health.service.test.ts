import { describe, expect, it } from "vitest";
import { AppError } from "../../src/common/errors/app-error.js";
import { HealthService } from "../../src/modules/health/health.service.js";

describe("HealthService", () => {
  it("resolves when the database accepts the connectivity check", async () => {
    const service = new HealthService({
      checkConnection: async () => true,
    });

    await expect(service.getStatus()).resolves.toBeUndefined();
  });

  it("fails closed when the database check fails", async () => {
    const service = new HealthService({
      checkConnection: async () => false,
    });

    await expect(service.getStatus()).rejects.toMatchObject({
      statusCode: 503,
      code: "DATABASE_UNAVAILABLE",
      message: "Database is unavailable",
    } satisfies Partial<AppError>);
  });
});
