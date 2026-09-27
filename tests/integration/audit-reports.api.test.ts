import { randomInt, randomUUID } from "node:crypto";
import { UserRole, UserStatus } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { hashPassword } from "../../src/common/security/password.js";
import { PrismaService } from "../../src/infrastructure/prisma/prisma.service.js";

const password = "Password1";
const userIds: string[] = [];
const carIds: string[] = [];

function uniquePhone(): string {
  return `+99878${randomInt(1_000_000, 10_000_000).toString()}`;
}

function auth(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

describe("audit and reports", () => {
  const app = createApp();
  let passwordHash = "";

  beforeAll(async () => {
    passwordHash = await hashPassword(password);
  });

  afterAll(async () => {
    await PrismaService.client().report.deleteMany({
      where: { OR: [{ reporterId: { in: userIds } }, { targetUserId: { in: userIds } }] },
    });
    await PrismaService.client().auditLog.deleteMany({
      where: { OR: [{ actorId: { in: userIds } }, { resourceId: { in: [...userIds, ...carIds] } }] },
    });
    await PrismaService.client().car.deleteMany({ where: { id: { in: carIds } } });
    await PrismaService.client().user.deleteMany({ where: { id: { in: userIds } } });
    await PrismaService.disconnect();
  });

  async function account(role: UserRole = UserRole.USER): Promise<{ id: string; token: string }> {
    const email = `audit.${randomUUID()}@example.com`;
    const user = await PrismaService.client().user.create({
      data: {
        email,
        phone: uniquePhone(),
        passwordHash,
        firstName: "Audit",
        lastName: "User",
        role,
        status: UserStatus.ACTIVE,
      },
      select: { id: true },
    });
    userIds.push(user.id);
    const login = await request(app).post("/api/v1/auth/login").send({ email, password });
    expect(login.status).toBe(200);
    return { id: user.id, token: login.body.data.accessToken as string };
  }

  it("records login and lets only admins read audit logs", async () => {
    const user = await account();
    const moderator = await account(UserRole.MODERATOR);
    const admin = await account(UserRole.ADMIN);

    const created = await PrismaService.client().auditLog.findFirst({
      where: { action: "LOGIN", actorId: user.id, resource: "user", resourceId: user.id },
    });
    expect(created?.actorId).toBe(user.id);

    const car = await request(app).post("/api/v1/cars").set(auth(user.token)).send({
      brand: "Audit",
      model: "Log",
      year: 2022,
      price: "12000.00",
      mileage: 1000,
      fuelType: "PETROL",
      transmission: "AUTOMATIC",
      bodyType: "SEDAN",
      color: "White",
      engine: "1.6",
      description: "Audit car",
      location: "Tashkent",
      status: "AVAILABLE",
    });
    expect(car.status).toBe(201);
    const carId = car.body.data.car.id as string;
    carIds.push(carId);
    const carLog = await PrismaService.client().auditLog.findFirst({
      where: { action: "CAR_CREATED", resource: "car", resourceId: carId, actorId: user.id },
    });
    expect(carLog).not.toBeNull();

    const guest = await request(app).get("/api/v1/admin/audit-logs");
    expect(guest.status).toBe(401);
    const deniedUser = await request(app).get("/api/v1/admin/audit-logs").set(auth(user.token));
    expect(deniedUser.status).toBe(403);
    const deniedModerator = await request(app).get("/api/v1/admin/audit-logs").set(auth(moderator.token));
    expect(deniedModerator.status).toBe(403);

    const listed = await request(app)
      .get("/api/v1/admin/audit-logs")
      .set(auth(admin.token))
      .query({ actor: user.id, action: "CAR_CREATED", resource: "car", page: 1, limit: 10 });
    expect(listed.status).toBe(200);
    expect(listed.body.data.logs).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: "CAR_CREATED", resourceId: carId, actorId: user.id })]),
    );
    expect(listed.body.data.pagination.limit).toBe(10);
    expect(JSON.stringify(listed.body)).not.toContain("passwordHash");
  });

  it("lets a user report a car and keeps moderation to staff", async () => {
    const reporter = await account();
    const other = await account();
    const moderator = await account(UserRole.MODERATOR);
    const owner = await account();

    const car = await request(app).post("/api/v1/cars").set(auth(owner.token)).send({
      brand: "Report",
      model: "Car",
      year: 2021,
      price: "9000.00",
      mileage: 2000,
      fuelType: "PETROL",
      transmission: "MANUAL",
      bodyType: "HATCHBACK",
      color: "Blue",
      engine: "1.4",
      description: "Reported car",
      location: "Samarkand",
      status: "AVAILABLE",
    });
    expect(car.status).toBe(201);
    const carId = car.body.data.car.id as string;
    carIds.push(carId);

    const withStatus = await request(app).post("/api/v1/reports").set(auth(reporter.token)).send({
      carId,
      reason: "Misleading price",
      description: "The listed price does not match the photos.",
      status: "RESOLVED",
    });
    expect(withStatus.status).toBe(422);

    const guest = await request(app).post("/api/v1/reports").send({
      carId,
      reason: "Misleading price",
      description: "Guest cannot report.",
    });
    expect(guest.status).toBe(401);

    const created = await request(app).post("/api/v1/reports").set(auth(reporter.token)).send({
      carId,
      reason: "Misleading price",
      description: "The listed price does not match the photos.",
    });
    expect(created.status).toBe(201);
    expect(created.body.data.report.status).toBe("OPEN");
    expect(created.body.data.report.reporterId).toBe(reporter.id);
    const reportId = created.body.data.report.id as string;

    const isolated = await request(app).get(`/api/v1/reports/${reportId}`).set(auth(other.token));
    expect(isolated.status).toBe(404);
    const own = await request(app).get(`/api/v1/reports/${reportId}`).set(auth(reporter.token));
    expect(own.status).toBe(200);

    const userList = await request(app).get("/api/v1/admin/reports").set(auth(reporter.token));
    expect(userList.status).toBe(403);
    const userPatch = await request(app)
      .patch(`/api/v1/admin/reports/${reportId}`)
      .set(auth(reporter.token))
      .send({ status: "RESOLVED" });
    expect(userPatch.status).toBe(403);

    const queue = await request(app).get("/api/v1/admin/reports").set(auth(moderator.token)).query({ status: "OPEN" });
    expect(queue.status).toBe(200);
    expect(queue.body.data.reports).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: reportId, status: "OPEN" })]),
    );

    const reviewed = await request(app)
      .patch(`/api/v1/admin/reports/${reportId}`)
      .set(auth(moderator.token))
      .send({ status: "IN_REVIEW" });
    expect(reviewed.status).toBe(200);
    const resolved = await request(app)
      .patch(`/api/v1/admin/reports/${reportId}`)
      .set(auth(moderator.token))
      .send({ status: "RESOLVED" });
    expect(resolved.status).toBe(200);
    expect(resolved.body.data.report.status).toBe("RESOLVED");

    const reopened = await request(app)
      .patch(`/api/v1/admin/reports/${reportId}`)
      .set(auth(moderator.token))
      .send({ status: "OPEN" });
    expect(reopened.status).toBe(409);

    const stillResolved = await request(app).get(`/api/v1/reports/${reportId}`).set(auth(reporter.token));
    expect(stillResolved.body.data.report.status).toBe("RESOLVED");
  });
});
