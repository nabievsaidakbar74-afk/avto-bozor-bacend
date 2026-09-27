import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { authenticate } from "../../src/common/guards/authenticate.js";
import { authorize } from "../../src/common/guards/authorize.js";
import { errorMiddleware } from "../../src/common/middleware/error.middleware.js";
import { signAccessToken } from "../../src/common/security/jwt.js";
import { Permission } from "../../src/common/security/permissions.js";
import { RoleName } from "../../src/common/security/roles.js";

function buildApp() {
  const app = express();
  app.get(
    "/staff",
    authenticate,
    authorize({ permissions: [Permission.USER_BLOCK] }),
    (_req, res) => {
      res.status(200).json({ success: true, message: "ok" });
    },
  );
  app.use(errorMiddleware);
  return app;
}

describe("RBAC guards", () => {
  const app = buildApp();

  it("requires a bearer token", async () => {
    const response = await request(app).get("/staff");
    expect(response.status).toBe(401);
    expect(response.body.code).toBe("UNAUTHORIZED");
  });

  it("forbids a user without the required permission", async () => {
    const token = signAccessToken({
      sub: "6d9f0c2e-1b3a-4c5d-8e7f-123456789abc",
      role: RoleName.USER,
    });
    const response = await request(app).get("/staff").set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(403);
    expect(response.body.code).toBe("FORBIDDEN");
  });

  it("allows an admin and a super admin", async () => {
    const admin = signAccessToken({
      sub: "6d9f0c2e-1b3a-4c5d-8e7f-123456789abc",
      role: RoleName.ADMIN,
    });
    const superAdmin = signAccessToken({
      sub: "7d9f0c2e-1b3a-4c5d-8e7f-123456789abc",
      role: RoleName.SUPER_ADMIN,
    });

    const adminResponse = await request(app).get("/staff").set("Authorization", `Bearer ${admin}`);
    const superResponse = await request(app)
      .get("/staff")
      .set("Authorization", `Bearer ${superAdmin}`);

    expect(adminResponse.status).toBe(200);
    expect(superResponse.status).toBe(200);
  });
});
