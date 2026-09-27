import { randomInt, randomUUID } from "node:crypto";
import { UserRole, UserStatus } from "@prisma/client";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { hashPassword } from "../../src/common/security/password.js";
import { PrismaService } from "../../src/infrastructure/prisma/prisma.service.js";
import { env } from "../../src/config/env.js";

const password = "Password1";
const userIds: string[] = [];
const carIds: string[] = [];

function uniquePhone(): string {
  return `+99880${randomInt(1_000_000, 10_000_000).toString()}`;
}

function auth(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

describe("security controls", () => {
  const app = createApp();
  let passwordHash = "";

  beforeAll(async () => {
    passwordHash = await hashPassword(password);
  });

  afterAll(async () => {
    const purchases = await PrismaService.client().purchase.findMany({
      where: { OR: [{ buyerId: { in: userIds } }, { sellerId: { in: userIds } }] },
      select: { id: true },
    });
    const bookings = await PrismaService.client().rentalBooking.findMany({
      where: { OR: [{ renterId: { in: userIds } }, { ownerId: { in: userIds } }] },
      select: { id: true },
    });
    const purchaseIds = purchases.map((purchase) => purchase.id);
    const bookingIds = bookings.map((booking) => booking.id);
    await PrismaService.client().payment.deleteMany({
      where: { OR: [{ purchaseId: { in: purchaseIds } }, { bookingId: { in: bookingIds } }] },
    });
    await PrismaService.client().purchase.deleteMany({ where: { id: { in: purchaseIds } } });
    await PrismaService.client().rentalBooking.deleteMany({ where: { id: { in: bookingIds } } });
    await PrismaService.client().auditLog.deleteMany({
      where: { OR: [{ actorId: { in: userIds } }, { resourceId: { in: [...userIds, ...carIds, ...purchaseIds] } }] },
    });
    await PrismaService.client().listing.deleteMany({ where: { ownerId: { in: userIds } } });
    await PrismaService.client().car.deleteMany({ where: { id: { in: carIds } } });
    await PrismaService.client().user.deleteMany({ where: { id: { in: userIds } } });
    await PrismaService.disconnect();
  });

  async function account(): Promise<{ id: string; token: string }> {
    const email = `security.${randomUUID()}@example.com`;
    const user = await PrismaService.client().user.create({
      data: {
        email,
        phone: uniquePhone(),
        passwordHash,
        firstName: "Secure",
        lastName: "User",
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
      },
      select: { id: true },
    });
    userIds.push(user.id);
    const login = await request(app).post("/api/v1/auth/login").send({ email, password });
    expect(login.status).toBe(200);
    return { id: user.id, token: login.body.data.accessToken as string };
  }

  async function createCar(token: string): Promise<string> {
    const response = await request(app).post("/api/v1/cars").set(auth(token)).send({
      brand: "Secure",
      model: "Lock",
      year: 2022,
      price: "15000.00",
      mileage: 1000,
      fuelType: "PETROL",
      transmission: "AUTOMATIC",
      bodyType: "SEDAN",
      color: "Black",
      engine: "1.6",
      description: "Security car",
      location: `Security ${randomUUID()}`,
      status: "AVAILABLE",
    });
    expect(response.status).toBe(201);
    const carId = response.body.data.car.id as string;
    carIds.push(carId);
    return carId;
  }

  async function publishBoth(carId: string, ownerId: string): Promise<void> {
    await PrismaService.client().listing.createMany({
      data: [
        {
          carId,
          ownerId,
          type: "SALE",
          status: "PUBLISHED",
          title: "Sale lock",
          description: "Sale",
          salePrice: "15000.00",
          publishedAt: new Date(),
        },
        {
          carId,
          ownerId,
          type: "RENT",
          status: "PUBLISHED",
          title: "Rent lock",
          description: "Rent",
          rentalDailyPrice: "40.00",
          publishedAt: new Date(),
        },
      ],
    });
  }

  it("rejects an invalid, mistyped, and expired access token", async () => {
    const userId = randomUUID();
    const malformed = await request(app).get("/api/v1/auth/me").set("Authorization", "Bearer not-a-jwt");
    const wrongKey = jwt.sign({ sub: userId, role: "USER" }, "wrong-secret-must-be-32-characters", {
      algorithm: "HS256",
      expiresIn: "5m",
    });
    const forged = await request(app).get("/api/v1/auth/me").set(auth(wrongKey));
    const expiredToken = jwt.sign({ sub: userId, role: "USER" }, env.JWT_SECRET, {
      algorithm: "HS256",
      expiresIn: "-1s",
    });
    const expired = await request(app).get("/api/v1/auth/me").set(auth(expiredToken));
    const escalated = jwt.sign({ sub: userId, role: "SUPER_ADMIN" }, env.JWT_SECRET, {
      algorithm: "HS256",
      expiresIn: "5m",
    });
    const missingAccount = await request(app).get("/api/v1/admin/users").set(auth(escalated));

    expect(malformed.status).toBe(401);
    expect(malformed.body.code).toBe("UNAUTHORIZED");
    expect(forged.status).toBe(401);
    expect(expired.status).toBe(401);
    expect(missingAccount.status).toBe(401);
  });

  it("does not serve files outside the upload directory", async () => {
    const leaked = await request(app).get("/uploads/../.env");
    expect(leaked.status).not.toBe(200);
    expect(leaked.text).not.toMatch(/DATABASE_URL|JWT_SECRET/);
  });

  it("rejects client control of sale and rental car statuses", async () => {
    const owner = await account();
    const buyer = await account();
    const renter = await account();
    const carId = await createCar(owner.token);

    const sold = await request(app).patch(`/api/v1/cars/${carId}`).set(auth(owner.token)).send({ status: "SOLD" });
    expect(sold.status).toBe(422);

    await publishBoth(carId, owner.id);
    const purchase = await request(app).post("/api/v1/purchases").set(auth(buyer.token)).send({ carId });
    expect(purchase.status).toBe(201);

    const released = await request(app)
      .patch(`/api/v1/cars/${carId}`)
      .set(auth(owner.token))
      .send({ status: "AVAILABLE" });
    expect(released.status).toBe(409);
    expect(released.body.code).toBe("CAR_STATUS_LOCKED");

    await PrismaService.client().car.update({ where: { id: carId }, data: { status: "AVAILABLE" } });
    const booking = await request(app).post("/api/v1/bookings").set(auth(renter.token)).send({
      carId,
      startDate: "2026-10-10",
      endDate: "2026-10-14",
    });
    expect(booking.status).toBe(409);
    expect(booking.body.code).toBe("CAR_NOT_AVAILABLE");
  });

  it("blocks a purchase while a rental is confirmed", async () => {
    const owner = await account();
    const buyer = await account();
    const renter = await account();
    const carId = await createCar(owner.token);
    await publishBoth(carId, owner.id);

    const booking = await request(app).post("/api/v1/bookings").set(auth(renter.token)).send({
      carId,
      startDate: "2026-11-01",
      endDate: "2026-11-05",
    });
    expect(booking.status).toBe(201);
    const confirmed = await request(app)
      .post(`/api/v1/bookings/${booking.body.data.booking.id as string}/confirm`)
      .set(auth(owner.token));
    expect(confirmed.status).toBe(200);

    const purchase = await request(app).post("/api/v1/purchases").set(auth(buyer.token)).send({ carId });
    expect(purchase.status).toBe(409);
    expect(purchase.body.code).toBe("CAR_NOT_AVAILABLE");
  });
});
