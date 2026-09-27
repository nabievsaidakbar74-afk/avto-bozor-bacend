import { describe, expect, it } from "vitest";
import { toTestDatabaseUrl } from "../../src/config/test-database-url.js";

describe("test database URL", () => {
  it("rewrites the local application database to avto_bozor_test", () => {
    expect(toTestDatabaseUrl("postgresql://user:secret@127.0.0.1:5432/avto_bozor?schema=public")).toBe(
      "postgresql://user:secret@127.0.0.1:5432/avto_bozor_test?schema=public",
    );
  });

  it("keeps an existing local test database URL", () => {
    const url = "postgresql://user:secret@localhost:5432/avto_bozor_test";
    expect(toTestDatabaseUrl(url)).toBe(url);
  });

  it("refuses a non-local database", () => {
    expect(() => toTestDatabaseUrl("postgresql://user:secret@db.example.com:5432/avto_bozor")).toThrow(
      /avto_bozor_test/,
    );
  });
});
