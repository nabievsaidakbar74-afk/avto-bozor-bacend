import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";
import { PrismaService } from "../../src/infrastructure/prisma/prisma.service.js";

vi.mock("../../src/infrastructure/prisma/prisma.service.js", () => ({
  PrismaService: {
    checkConnection: vi.fn(async () => true),
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    client: vi.fn(),
  },
  prisma: {},
}));

describe("HTTP API", () => {
  const app = createApp();

  beforeEach(() => {
    vi.mocked(PrismaService.checkConnection).mockResolvedValue(true);
  });

  it("GET /api/v1/health returns the healthy contract", async () => {
    const response = await request(app).get("/api/v1/health");

    expect(response.status).toBe(200);
    expect(response.headers["x-powered-by"]).toBeUndefined();
    expect(response.body).toEqual({
      success: true,
      message: "API is healthy",
    });
  });

  it("GET /api/v1/health returns 503 when PostgreSQL is unavailable", async () => {
    vi.mocked(PrismaService.checkConnection).mockResolvedValue(false);
    const response = await request(app).get("/api/v1/health");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      success: false,
      message: "Database is unavailable",
      code: "DATABASE_UNAVAILABLE",
    });
    expect(JSON.stringify(response.body)).not.toContain("postgresql://");
  });

  it("returns 404 for an unknown route", async () => {
    const response = await request(app).get("/api/v1/does-not-exist");
    expect(response.status).toBe(404);
    expect(response.body.code).toBe("ROUTE_NOT_FOUND");
  });

  it("returns 400 for malformed JSON", async () => {
    const response = await request(app)
      .post("/api/v1/auth")
      .set("Content-Type", "application/json")
      .send("{");

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("MALFORMED_JSON");
  });

  it("serves Swagger UI", async () => {
    const response = await request(app).get("/api/docs/");
    expect(response.status).toBe(200);
    expect(response.type).toContain("html");
    expect(response.text).toContain("Avto Bozor API");
  });
});
