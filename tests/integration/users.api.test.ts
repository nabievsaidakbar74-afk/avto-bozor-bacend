import { randomInt, randomUUID } from "node:crypto";
import { UserRole, UserStatus } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { hashPassword } from "../../src/common/security/password.js";
import { PrismaService } from "../../src/infrastructure/prisma/prisma.service.js";

const password = "Password1";
const createdEmails: string[] = [];

function uniquePhone(): string {
  return `+99870${randomInt(1_000_000, 10_000_000).toString()}`;
}

describe("users and admin authorization", () => {
  const app = createApp();
  let passwordHash = "";

  beforeAll(async () => {
    passwordHash = await hashPassword(password);
  });

  afterAll(async () => {
    await PrismaService.client().user.deleteMany({
      where: { email: { in: createdEmails } },
    });
    await PrismaService.disconnect();
  });

  async function account(role: UserRole, firstName = "Test"): Promise<{
    id: string;
    email: string;
    token: string;
  }> {
    const email = `users.${randomUUID()}@example.com`;
    createdEmails.push(email);
    const user = await PrismaService.client().user.create({
      data: {
        email,
        phone: uniquePhone(),
        passwordHash,
        firstName,
        lastName: "Account",
        role,
        status: UserStatus.ACTIVE,
      },
      select: { id: true, email: true },
    });
    const login = await request(app).post("/api/v1/auth/login").send({ email, password });
    expect(login.status).toBe(200);
    return { id: user.id, email, token: login.body.data.accessToken as string };
  }

  function auth(token: string): { Authorization: string } {
    return { Authorization: `Bearer ${token}` };
  }

  it("returns and updates only the authenticated user's profile", async () => {
    const user = await account(UserRole.USER, "Dilshod");
    const me = await request(app).get("/api/v1/users/me").set(auth(user.token));
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(user.email);
    expect(me.body.data.user.id).toBe(user.id);
    expect(me.body.data.user.passwordHash).toBeUndefined();
    expect(JSON.stringify(me.body)).not.toContain(password);

    const nextEmail = `renamed.${randomUUID()}@example.com`;
    createdEmails.push(nextEmail);
    const updated = await request(app)
      .patch("/api/v1/users/me")
      .set(auth(user.token))
      .send({ firstName: "Updated", email: nextEmail.toUpperCase() });
    expect(updated.status).toBe(200);
    expect(updated.body.data.user.firstName).toBe("Updated");
    expect(updated.body.data.user.email).toBe(nextEmail);
    expect(updated.body.data.user.role).toBe("USER");
    expect(updated.body.data.user.passwordHash).toBeUndefined();

    const forbidden = await request(app).patch("/api/v1/users/me").set(auth(user.token)).send({
      role: "SUPER_ADMIN",
      status: "ACTIVE",
      passwordHash: "not-a-hash",
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
    });
    expect(forbidden.status).toBe(422);
    expect(forbidden.body.code).toBe("VALIDATION_ERROR");

    const scriptAvatar = await request(app)
      .patch("/api/v1/users/me")
      .set(auth(user.token))
      .send({ avatar: "javascript:alert(1)" });
    expect(scriptAvatar.status).toBe(422);

    const unauthenticated = await request(app).get("/api/v1/users/me");
    expect(unauthenticated.status).toBe(401);
  });

  it("limits the admin user directory to admin and super admin", async () => {
    const user = await account(UserRole.USER, "DirectoryUser");
    const moderator = await account(UserRole.MODERATOR);
    const admin = await account(UserRole.ADMIN);
    const superAdmin = await account(UserRole.SUPER_ADMIN);

    const userList = await request(app).get("/api/v1/admin/users").set(auth(user.token));
    const moderatorList = await request(app).get("/api/v1/admin/users").set(auth(moderator.token));
    expect(userList.status).toBe(403);
    expect(moderatorList.status).toBe(403);
    expect(userList.body.code).toBe("FORBIDDEN");

    const adminList = await request(app)
      .get("/api/v1/admin/users")
      .query({ search: "DirectoryUser", role: "USER", sortBy: "email", sortOrder: "asc" })
      .set(auth(admin.token));
    expect(adminList.status).toBe(200);
    expect(adminList.body.data.users).toEqual([
      expect.objectContaining({ id: user.id, role: "USER" }),
    ]);
    expect(adminList.body.data.users[0].passwordHash).toBeUndefined();
    expect(adminList.body.data.pagination.total).toBe(1);

    const superList = await request(app)
      .get(`/api/v1/admin/users/${user.id}`)
      .set(auth(superAdmin.token));
    expect(superList.status).toBe(200);
    expect(superList.body.data.user.id).toBe(user.id);

    const hidden = await request(app).get(`/api/v1/admin/users/${admin.id}`).set(auth(user.token));
    expect(hidden.status).toBe(403);
  });

  it("prevents role escalation when changing account status", async () => {
    const user = await account(UserRole.USER);
    const admin = await account(UserRole.ADMIN);
    const otherAdmin = await account(UserRole.ADMIN);
    const superAdmin = await account(UserRole.SUPER_ADMIN);

    const blocked = await request(app)
      .patch(`/api/v1/admin/users/${user.id}/status`)
      .set(auth(admin.token))
      .send({ status: "BLOCKED" });
    expect(blocked.status).toBe(200);
    expect(blocked.body.data.user.status).toBe("BLOCKED");
    expect(blocked.body.data.user.role).toBe("USER");

    const profile = await request(app).get("/api/v1/users/me").set(auth(user.token));
    expect(profile.status).toBe(403);
    expect(profile.body.code).toBe("ACCOUNT_DISABLED");

    const peer = await request(app)
      .patch(`/api/v1/admin/users/${otherAdmin.id}/status`)
      .set(auth(admin.token))
      .send({ status: "BLOCKED" });
    expect(peer.status).toBe(403);
    expect(peer.body.code).toBe("ROLE_ESCALATION");

    const self = await request(app)
      .patch(`/api/v1/admin/users/${admin.id}/status`)
      .set(auth(admin.token))
      .send({ status: "BLOCKED" });
    expect(self.status).toBe(403);
    expect(self.body.code).toBe("SELF_STATUS_CHANGE");

    const escalate = await request(app)
      .patch(`/api/v1/admin/users/${user.id}/status`)
      .set(auth(admin.token))
      .send({ status: "ACTIVE", role: "ADMIN" });
    expect(escalate.status).toBe(422);

    const bySuperAdmin = await request(app)
      .patch(`/api/v1/admin/users/${otherAdmin.id}/status`)
      .set(auth(superAdmin.token))
      .send({ status: "SUSPENDED" });
    expect(bySuperAdmin.status).toBe(200);
    expect(bySuperAdmin.body.data.user.status).toBe("SUSPENDED");

    const byUser = await request(app)
      .patch(`/api/v1/admin/users/${admin.id}/status`)
      .set(auth(user.token))
      .send({ status: "ACTIVE" });
    expect(byUser.status).toBe(403);
  });

  it("uses the database role after a token was issued", async () => {
    const admin = await account(UserRole.ADMIN);
    await PrismaService.client().user.update({
      where: { id: admin.id },
      data: { role: UserRole.USER },
    });

    const response = await request(app).get("/api/v1/admin/users").set(auth(admin.token));
    expect(response.status).toBe(403);
    expect(response.body.code).toBe("FORBIDDEN");
  });
});
