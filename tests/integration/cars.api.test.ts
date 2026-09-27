import { randomInt, randomUUID } from "node:crypto";
import { UserRole, UserStatus } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { hashPassword } from "../../src/common/security/password.js";
import { PrismaService } from "../../src/infrastructure/prisma/prisma.service.js";

const password = "Password1";
const userIds: string[] = [];

function uniquePhone(): string {
  return `+99871${randomInt(1_000_000, 10_000_000).toString()}`;
}

function auth(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

describe("cars API", () => {
  const app = createApp();
  let passwordHash = "";

  beforeAll(async () => {
    passwordHash = await hashPassword(password);
  });

  afterAll(async () => {
    await PrismaService.client().car.deleteMany({
      where: { ownerId: { in: userIds } },
    });
    await PrismaService.client().user.deleteMany({
      where: { id: { in: userIds } },
    });
    await PrismaService.disconnect();
  });

  async function account(role: UserRole, firstName = "Driver"): Promise<{
    id: string;
    token: string;
  }> {
    const email = `cars.${randomUUID()}@example.com`;
    const user = await PrismaService.client().user.create({
      data: {
        email,
        phone: uniquePhone(),
        passwordHash,
        firstName,
        lastName: "Seller",
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

  function carBody(location: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      brand: "Cobalt",
      model: "LTZ",
      year: 2022,
      price: "15000.00",
      mileage: 12000,
      fuelType: "PETROL",
      transmission: "AUTOMATIC",
      bodyType: "SEDAN",
      color: "White",
      engine: "1.5",
      description: "Clean family car",
      location,
      status: "AVAILABLE",
      ...overrides,
    };
  }

  it("lists only public cars and applies filters, pagination, and sorting", async () => {
    const owner = await account(UserRole.USER, "Sardor");
    const location = `Lot ${randomUUID()}`;
    const marker = `marker-${randomUUID()}`;

    const cheaper = await request(app)
      .post("/api/v1/cars")
      .set(auth(owner.token))
      .send(carBody(location, { price: "10000.00", model: "Spark", description: marker }));
    const mid = await request(app)
      .post("/api/v1/cars")
      .set(auth(owner.token))
      .send(
        carBody(location, {
          price: "20000.50",
          model: "Gentra",
          fuelType: "DIESEL",
          year: 2020,
          mileage: 40000,
        }),
      );
    const expensive = await request(app)
      .post("/api/v1/cars")
      .set(auth(owner.token))
      .send(carBody(location, { price: "30000.00", model: "Malibu", year: 2024 }));
    const draft = await request(app)
      .post("/api/v1/cars")
      .set(auth(owner.token))
      .send(carBody(location, { status: "DRAFT", model: "Hidden" }));

    expect(cheaper.status).toBe(201);
    expect(mid.status).toBe(201);
    expect(expensive.status).toBe(201);
    expect(draft.status).toBe(201);

    const listed = await request(app).get("/api/v1/cars").query({ location, sortBy: "price", sortOrder: "asc" });
    expect(listed.status).toBe(200);
    expect(listed.body.data.pagination.total).toBe(3);
    expect(listed.body.data.cars.map((car: { model: string }) => car.model)).toEqual([
      "Spark",
      "Gentra",
      "Malibu",
    ]);
    expect(listed.body.data.cars[0].price).toBe("10000.00");
    expect(listed.body.data.cars[0].owner).toEqual({
      id: owner.id,
      firstName: "Sardor",
      lastName: "Seller",
      avatar: null,
    });
    expect(JSON.stringify(listed.body)).not.toMatch(/passwordHash|refreshToken|email|phone/i);

    const filtered = await request(app).get("/api/v1/cars").query({
      location,
      search: marker,
      brand: "cobalt",
      model: "Spark",
      minPrice: 9000,
      maxPrice: 12000,
      minYear: 2021,
      maxYear: 2023,
      fuelType: "PETROL",
      transmission: "AUTOMATIC",
      bodyType: "SEDAN",
      minMileage: 1000,
      maxMileage: 20000,
      status: "AVAILABLE",
    });
    expect(filtered.status).toBe(200);
    expect(filtered.body.data.cars).toHaveLength(1);
    expect(filtered.body.data.cars[0].id).toBe(cheaper.body.data.car.id);

    const page = await request(app)
      .get("/api/v1/cars")
      .query({ location, page: 2, limit: 1, sortBy: "price", sortOrder: "desc" });
    expect(page.status).toBe(200);
    expect(page.body.data.pagination).toMatchObject({ page: 2, limit: 1, total: 3, totalPages: 3 });
    expect(page.body.data.cars).toHaveLength(1);
    expect(page.body.data.cars[0].model).toBe("Gentra");

    const injected = await request(app).get("/api/v1/cars").query({ sortBy: "price; drop table cars" });
    expect(injected.status).toBe(422);
    expect(injected.body.code).toBe("VALIDATION_ERROR");

    const hidden = await request(app).get(`/api/v1/cars/${draft.body.data.car.id}`);
    expect(hidden.status).toBe(404);

    const visible = await request(app).get(`/api/v1/cars/${cheaper.body.data.car.id}`);
    expect(visible.status).toBe(200);
    expect(visible.body.data.car.owner.email).toBeUndefined();
  });

  it("creates a car for the authenticated user and ignores a client owner id", async () => {
    const owner = await account(UserRole.USER);
    const other = await account(UserRole.USER);
    const location = `Create ${randomUUID()}`;

    const rejected = await request(app)
      .post("/api/v1/cars")
      .set(auth(owner.token))
      .send(carBody(location, { ownerId: other.id }));
    expect(rejected.status).toBe(422);

    const guest = await request(app).post("/api/v1/cars").send(carBody(location));
    expect(guest.status).toBe(401);

    const created = await request(app).post("/api/v1/cars").set(auth(owner.token)).send(carBody(location));
    expect(created.status).toBe(201);
    expect(created.body.data.car.ownerId).toBe(owner.id);
    expect(created.body.data.car.passwordHash).toBeUndefined();
  });

  it("lets the owner or an admin update a car and rejects another user", async () => {
    const owner = await account(UserRole.USER);
    const other = await account(UserRole.USER);
    const admin = await account(UserRole.ADMIN);
    const location = `Update ${randomUUID()}`;
    const created = await request(app).post("/api/v1/cars").set(auth(owner.token)).send(carBody(location));
    const carId = created.body.data.car.id as string;

    const updated = await request(app)
      .patch(`/api/v1/cars/${carId}`)
      .set(auth(owner.token))
      .send({ price: "18000.00", ownerId: other.id });
    expect(updated.status).toBe(422);

    const ownUpdate = await request(app)
      .patch(`/api/v1/cars/${carId}`)
      .set(auth(owner.token))
      .send({ price: "18000.00" });
    expect(ownUpdate.status).toBe(200);
    expect(ownUpdate.body.data.car.price).toBe("18000.00");
    expect(ownUpdate.body.data.car.ownerId).toBe(owner.id);

    const foreign = await request(app)
      .patch(`/api/v1/cars/${carId}`)
      .set(auth(other.token))
      .send({ price: "1.00" });
    expect(foreign.status).toBe(404);
    expect(foreign.body.code).toBe("NOT_FOUND");

    const adminUpdate = await request(app)
      .patch(`/api/v1/cars/${carId}`)
      .set(auth(admin.token))
      .send({ color: "Black" });
    expect(adminUpdate.status).toBe(200);
    expect(adminUpdate.body.data.car.color).toBe("Black");
    expect(adminUpdate.body.data.car.ownerId).toBe(owner.id);
  });

  it("soft-deletes a car for the owner and rejects an unauthorized delete", async () => {
    const owner = await account(UserRole.USER);
    const other = await account(UserRole.USER);
    const location = `Delete ${randomUUID()}`;
    const created = await request(app).post("/api/v1/cars").set(auth(owner.token)).send(carBody(location));
    const carId = created.body.data.car.id as string;

    const missing = await request(app).delete(`/api/v1/cars/${carId}`);
    expect(missing.status).toBe(401);

    const foreign = await request(app).delete(`/api/v1/cars/${carId}`).set(auth(other.token));
    expect(foreign.status).toBe(404);

    const removed = await request(app).delete(`/api/v1/cars/${carId}`).set(auth(owner.token));
    expect(removed.status).toBe(200);
    expect(removed.body.data.car.status).toBe("INACTIVE");

    const listed = await request(app).get("/api/v1/cars").query({ location });
    expect(listed.body.data.pagination.total).toBe(0);

    const hidden = await request(app).get(`/api/v1/cars/${carId}`);
    expect(hidden.status).toBe(404);
  });
});
