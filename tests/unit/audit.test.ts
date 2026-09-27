import { describe, expect, it, vi } from "vitest";
import { logger } from "../../src/config/logger.js";
import { auditService } from "../../src/modules/audit/audit.service.js";

describe("auditService", () => {
  it("writes a structured audit event", () => {
    const spy = vi.spyOn(logger, "info").mockImplementation(() => logger);
    auditService.record({
      action: "foundation.ready",
      actorId: "6d9f0c2e-1b3a-4c5d-8e7f-123456789abc",
    });

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        audit: true,
        action: "foundation.ready",
        actorId: "6d9f0c2e-1b3a-4c5d-8e7f-123456789abc",
      }),
      "audit_event",
    );
  });
});
