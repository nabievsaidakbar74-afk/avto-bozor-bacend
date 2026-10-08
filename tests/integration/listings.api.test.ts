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
  return `+99872${randomInt(1_000_000, 10_000_000).toString()}`;
}

function auth(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

function png(width: number, height: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(13, 0);
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = 8;
  data[9] = 2;
  return Buffer.concat([signature, length, Buffer.from("IHDR"), data, Buffer.alloc(4)]);
}

describe("listings, moderation, and car images", () => {
  const app = createApp();
  let passwordHash = "";

  beforeAll(async () => {
    passwordHash = await hashPassword(password);
  });

  afterAll(async () => {
    const listings = await PrismaService.client().listing.findMany({
      where: { ownerId: { in: userIds } },
      select: { id: true },
    });
    const listingIds = listings.map((listing) => listing.id);
    await PrismaService.client().auditLog.deleteMany({
      where: { resourceId: { in: listingIds } },
    });
    await PrismaService.client().listing.deleteMany({ where: { ownerId: { in: userIds } } });
    await PrismaService.client().car.deleteMany({ where: { ownerId: { in: userIds } } });
    await PrismaService.client().user.deleteMany({ where: { id: { in: userIds } } });
    await PrismaService.disconnect();
  });

  async function account(role: UserRole): Promise<{ id: string; token: string }> {
    const email = `market.${randomUUID()}@example.com`;
    const user = await PrismaService.client().user.create({
      data: {
        email,
        phone: uniquePhone(),
        passwordHash,
        firstName: "Listing",
        lastName: "Owner",
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

  async function createCar(token: string, location: string): Promise<string> {
    const response = await request(app)
      .post("/api/v1/cars")
      .set(auth(token))
      .send({
        brand: "Tracker",
        model: "LT",
        year: 2023,
        price: "22000.00",
        mileage: 8000,
        fuelType: "PETROL",
        transmission: "AUTOMATIC",
        bodyType: "SUV",
        color: "Grey",
        engine: "1.8",
        description: "Ready to list",
        location,
        status: "AVAILABLE",
      });
    expect(response.status).toBe(201);
    return response.body.data.car.id as string;
  }

  it("stores an image only for the owner and ignores the client filename", async () => {
    const owner = await account(UserRole.USER);
    const other = await account(UserRole.USER);
    const carId = await createCar(owner.token, `Images ${randomUUID()}`);

    const guest = await request(app)
      .post(`/api/v1/cars/${carId}/images`)
      .attach("image", png(300, 300), { filename: "photo.png", contentType: "image/png" });
    expect(guest.status).toBe(401);

    const foreign = await request(app)
      .post(`/api/v1/cars/${carId}/images`)
      .set(auth(other.token))
      .attach("image", png(300, 300), { filename: "../../etc/passwd.png", contentType: "image/png" });
    expect(foreign.status).toBe(404);

    const tiny = await request(app)
      .post(`/api/v1/cars/${carId}/images`)
      .set(auth(owner.token))
      .attach("image", png(10, 10), { filename: "tiny.png", contentType: "image/png" });
    expect(tiny.status).toBe(422);
    expect(tiny.body.code).toBe("INVALID_IMAGE");

    const uploaded = await request(app)
      .post(`/api/v1/cars/${carId}/images`)
      .set(auth(owner.token))
      .attach("image", png(300, 300), { filename: "../../etc/passwd.png", contentType: "image/png" });
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.data.image.url).toMatch(/^\/uploads\/car-images\/[0-9a-f-]{36}\.png$/);
    expect(uploaded.body.data.image.url).not.toContain("passwd");
    expect(uploaded.body.data.image.storageKey).toBeUndefined();

    const removed = await request(app)
      .delete(`/api/v1/cars/${carId}/images/${uploaded.body.data.image.id}`)
      .set(auth(other.token));
    expect(removed.status).toBe(404);

    const deleted = await request(app)
      .delete(`/api/v1/cars/${carId}/images/${uploaded.body.data.image.id}`)
      .set(auth(owner.token));
    expect(deleted.status).toBe(200);
  });

  it("enforces listing ownership, public visibility, and moderation", async () => {
    const owner = await account(UserRole.USER);
    const other = await account(UserRole.USER);
    const moderator = await account(UserRole.MODERATOR);
    const location = `Listings ${randomUUID()}`;
    const marker = `sale-${randomUUID()}`;
    const carId = await createCar(owner.token, location);
    const otherCarId = await createCar(other.token, `${location}-other`);

    const stolen = await request(app).post("/api/v1/listings").set(auth(owner.token)).send({
      carId: otherCarId,
      ownerId: owner.id,
      type: "SALE",
      title: marker,
      description: "Should not attach to another car",
      salePrice: "22000.00",
    });
    expect(stolen.status).toBe(422);

    const notOwned = await request(app).post("/api/v1/listings").set(auth(owner.token)).send({
      carId: otherCarId,
      type: "SALE",
      title: marker,
      description: "Should not attach to another car",
      salePrice: "22000.00",
    });
    expect(notOwned.status).toBe(404);

    const publishedDirectly = await request(app).post("/api/v1/listings").set(auth(owner.token)).send({
      carId,
      type: "SALE",
      title: marker,
      description: "Direct publish",
      salePrice: "22000.00",
      status: "PUBLISHED",
    });
    expect(publishedDirectly.status).toBe(422);

    const created = await request(app).post("/api/v1/listings").set(auth(owner.token)).send({
      carId,
      type: "SALE",
      title: marker,
      description: "Family SUV",
      salePrice: "21000.00",
    });
    expect(created.status).toBe(201);
    expect(created.body.data.listing.ownerId).toBe(owner.id);
    expect(created.body.data.listing.status).toBe("DRAFT");
    const listingId = created.body.data.listing.id as string;

    const mine = await request(app).get("/api/v1/my/listings").set(auth(owner.token));
    expect(mine.status).toBe(200);
    expect(mine.body.data.listings.some((listing: { id: string }) => listing.id === listingId)).toBe(true);
    expect(JSON.stringify(mine.body)).not.toMatch(/passwordHash|refreshToken/);

    const hidden = await request(app).get("/api/v1/listings").query({ search: marker });
    expect(hidden.status).toBe(200);
    expect(hidden.body.data.listings).toHaveLength(0);

    const guestDetail = await request(app).get(`/api/v1/listings/${listingId}`);
    expect(guestDetail.status).toBe(404);

    const sold = await request(app)
      .patch(`/api/v1/listings/${listingId}`)
      .set(auth(owner.token))
      .send({ status: "SOLD" });
    expect(sold.status).toBe(409);
    expect(sold.body.code).toBe("INVALID_STATUS_TRANSITION");

    const publish = await request(app)
      .patch(`/api/v1/listings/${listingId}`)
      .set(auth(owner.token))
      .send({ status: "PUBLISHED" });
    expect(publish.status).toBe(409);

    const foreignUpdate = await request(app)
      .patch(`/api/v1/listings/${listingId}`)
      .set(auth(other.token))
      .send({ title: "Hijacked" });
    expect(foreignUpdate.status).toBe(404);

    const photo = await request(app)
      .post(`/api/v1/cars/${carId}/images`)
      .set(auth(owner.token))
      .attach("image", png(300, 300), { filename: "photo.png", contentType: "image/png" });
    expect(photo.status).toBe(201);

    const submitted = await request(app)
      .patch(`/api/v1/listings/${listingId}`)
      .set(auth(owner.token))
      .send({ status: "PENDING_MODERATION", description: "Family SUV. Telegram @owner" });
    expect(submitted.status).toBe(200);
    expect(submitted.body.data.listing.status).toBe("PENDING_MODERATION");
    expect(submitted.body.data.moderation.reasons).toContain("E'lon qoidalariga mos kelmaydi");

    const userQueue = await request(app).get("/api/v1/admin/listings/pending").set(auth(owner.token));
    expect(userQueue.status).toBe(403);

    const missingReason = await request(app)
      .post(`/api/v1/admin/listings/${listingId}/reject`)
      .set(auth(moderator.token))
      .send({});
    expect(missingReason.status).toBe(422);

    const rejected = await request(app)
      .post(`/api/v1/admin/listings/${listingId}/reject`)
      .set(auth(moderator.token))
      .send({ reason: "Photos are too dark" });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.listing.status).toBe("REJECTED");

    const rejectionLog = await PrismaService.client().auditLog.findFirst({
      where: { action: "LISTING_REJECTED", resourceId: listingId },
    });
    expect(rejectionLog?.metadata).toMatchObject({ reason: "Photos are too dark", to: "REJECTED" });

    const resubmitted = await request(app)
      .patch(`/api/v1/listings/${listingId}`)
      .set(auth(owner.token))
      .send({ status: "PENDING_MODERATION" });
    expect(resubmitted.status).toBe(200);

    const approved = await request(app)
      .post(`/api/v1/admin/listings/${listingId}/approve`)
      .set(auth(moderator.token));
    expect(approved.status).toBe(200);
    expect(approved.body.data.listing.status).toBe("PUBLISHED");

    const approvalLog = await PrismaService.client().auditLog.findFirst({
      where: { action: "LISTING_APPROVED", resourceId: listingId },
    });
    expect(approvalLog?.actorId).toBe(moderator.id);

    const listed = await request(app).get("/api/v1/listings").query({
      search: marker,
      type: "SALE",
      location,
      brand: "tracker",
      minPrice: 20000,
      maxPrice: 25000,
      sortBy: "salePrice",
      sortOrder: "asc",
      page: 1,
      limit: 10,
    });
    expect(listed.status).toBe(200);
    expect(listed.body.data.listings).toHaveLength(1);
    expect(listed.body.data.listings[0].id).toBe(listingId);
    expect(listed.body.data.listings[0].owner.email).toBeUndefined();

    const injected = await request(app).get("/api/v1/listings").query({ sortBy: "title; drop table listings" });
    expect(injected.status).toBe(422);

    const foreignDelete = await request(app).delete(`/api/v1/listings/${listingId}`).set(auth(other.token));
    expect(foreignDelete.status).toBe(404);

    const unauthenticatedDelete = await request(app).delete(`/api/v1/listings/${listingId}`);
    expect(unauthenticatedDelete.status).toBe(401);
  });

  it("publishes a clean listing and rejects one that breaks the rules", async () => {
    const owner = await account(UserRole.USER);
    const location = `Auto ${randomUUID()}`;
    const marker = `auto-${randomUUID()}`;
    const carId = await createCar(owner.token, location);
    const photo = await request(app)
      .post(`/api/v1/cars/${carId}/images`)
      .set(auth(owner.token))
      .attach("image", png(400, 300), { filename: "front.png", contentType: "image/png" });
    expect(photo.status).toBe(201);

    const published = await request(app).post("/api/v1/listings").set(auth(owner.token)).send({
      carId,
      type: "SALE",
      title: marker,
      description: "Serviced family car",
      salePrice: "21000.00",
      status: "PENDING_MODERATION",
    });
    expect(published.status).toBe(201);
    expect(published.body.data.listing.status).toBe("PUBLISHED");
    expect(published.body.data.listing.publishedAt).toEqual(expect.any(String));
    expect(published.body.data.moderation).toEqual({ status: "PUBLISHED", reasons: [] });

    const visible = await request(app).get("/api/v1/listings").query({ search: marker });
    expect(visible.status).toBe(200);
    expect(visible.body.data.listings.map((listing: { id: string }) => listing.id)).toContain(
      published.body.data.listing.id,
    );

    const mine = await request(app).get("/api/v1/my/listings").query({ status: "PUBLISHED" }).set(auth(owner.token));
    expect(mine.body.data.listings.map((listing: { id: string }) => listing.id)).toContain(
      published.body.data.listing.id,
    );

    const missingPhotoCar = await createCar(owner.token, `${location}-plain`);
    const rejected = await request(app).post("/api/v1/listings").set(auth(owner.token)).send({
      carId: missingPhotoCar,
      type: "SALE",
      title: `hidden-${randomUUID()}`,
      description: "No photo yet",
      salePrice: "21000.00",
      status: "PENDING_MODERATION",
    });
    expect(rejected.status).toBe(201);
    expect(rejected.body.data.listing.status).toBe("REJECTED");
    expect(rejected.body.message).toContain("Rasm talabga javob bermaydi");
    expect(rejected.body.data.moderation.reasons).toContain("Rasm talabga javob bermaydi");

    const hidden = await request(app).get("/api/v1/listings").query({ search: rejected.body.data.listing.title });
    expect(hidden.body.data.listings).toHaveLength(0);

    const duplicate = await request(app).post("/api/v1/listings").set(auth(owner.token)).send({
      carId,
      type: "SALE",
      title: `copy-${randomUUID()}`,
      description: "Same car again",
      salePrice: "21000.00",
      status: "PENDING_MODERATION",
    });
    expect(duplicate.status).toBe(201);
    expect(duplicate.body.data.listing.status).toBe("REJECTED");
    expect(duplicate.body.data.moderation.reasons).toContain("E'lon qoidalariga mos kelmaydi");
  });
});
