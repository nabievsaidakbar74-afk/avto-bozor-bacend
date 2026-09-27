import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { AppError } from "../../src/common/errors/app-error.js";
import { normalizeError, redactConnectionString } from "../../src/common/errors/normalize-error.js";

describe("normalizeError", () => {
  it("keeps operational application errors", () => {
    const error = new AppError("Authentication required", 401, "UNAUTHORIZED");
    expect(normalizeError(error)).toBe(error);
  });

  it("maps Zod failures to a validation error", () => {
    const error = new ZodError([
      {
        code: "custom",
        message: "Required",
        path: ["email"],
      },
    ]);

    const normalized = normalizeError(error);
    expect(normalized.statusCode).toBe(422);
    expect(normalized.code).toBe("VALIDATION_ERROR");
    expect(normalized.details).toEqual([{ path: "email", message: "Required" }]);
  });

  it("maps unique constraint failures without leaking database text", () => {
    const normalized = normalizeError({
      code: "P2002",
      clientVersion: "6.0.0",
      message: "Unique constraint failed on the fields: (`email`)",
    });

    expect(normalized.statusCode).toBe(409);
    expect(normalized.code).toBe("CONFLICT");
    expect(normalized.message).toBe("Resource already exists");
  });

  it("hides unexpected errors outside development", () => {
    const normalized = normalizeError(new Error("password=secret connection failed"));
    expect(normalized.statusCode).toBe(500);
    expect(normalized.message).toBe("Internal server error");
    expect(normalized.isOperational).toBe(false);
  });

  it("removes database connection strings from error text", () => {
    expect(
      redactConnectionString(
        "connect ECONNREFUSED postgresql://avto_bozor:secret@127.0.0.1:5432/avto_bozor",
      ),
    ).toBe("connect ECONNREFUSED [redacted]");
  });
});
