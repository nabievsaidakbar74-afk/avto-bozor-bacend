import { access, unlink } from "node:fs/promises";
import path from "node:path";
import { randomInt, randomUUID } from "node:crypto";
import { UserRole, UserStatus } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { hashPassword } from "../../src/common/security/password.js";
import { PrismaService } from "../../src/infrastructure/prisma/prisma.service.js";
import { MAX_IMAGE_BYTES } from "../../src/infrastructure/storage/image-file.js";
import { storageRoot } from "../../src/infrastructure/storage/storage.service.js";

const password = "Password1";
const userIds: string[] = [];
const carIds: string[] = [];

function uniquePhone(): string {
  return `+99879${randomInt(1_000_000, 10_000_000).toString()}`;
}

function auth(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

function png(width: number, height: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(13, 0);
  const type = Buffer.from("IHDR");
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = 8;
  data[9] = 2;
  return Buffer.concat([signature, length, type, data, Buffer.alloc(4)]);
}

function storedPath(url: string): string {
  const relative = url.replace(/^\/uploads\//, "");
  return path.join(storageRoot(), relative);
}

describe("car image uploads", () => {
  const app = createApp();
  let passwordHash = "";

  beforeAll(async () => {
    passwordHash = await hashPassword(password);
  });

  afterAll(async () => {
    const images = await PrismaService.client().carImage.findMany({
      where: { carId: { in: carIds } },
      select: { storageKey: true },
    });
    await Promise.all(
      images.map((image) => unlink(path.join(storageRoot(), image.storageKey)).catch(() => undefined)),
    );
    await PrismaService.client().auditLog.deleteMany({
      where: { OR: [{ actorId: { in: userIds } }, { resourceId: { in: [...userIds, ...carIds] } }] },
    });
    await PrismaService.client().car.deleteMany({ where: { id: { in: carIds } } });
    await PrismaService.client().user.deleteMany({ where: { id: { in: userIds } } });
    await PrismaService.disconnect();
  });

  async function account(role: UserRole = UserRole.USER): Promise<{ id: string; token: string }> {
    const email = `images.${randomUUID()}@example.com`;
    const user = await PrismaService.client().user.create({
      data: {
        email,
        phone: uniquePhone(),
        passwordHash,
        firstName: "Image",
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

  async function createCar(token: string): Promise<string> {
    const response = await request(app).post("/api/v1/cars").set(auth(token)).send({
      brand: "Image",
      model: "Upload",
      year: 2022,
      price: "11000.00",
      mileage: 1500,
      fuelType: "PETROL",
      transmission: "AUTOMATIC",
      bodyType: "SEDAN",
      color: "White",
      engine: "1.6",
      description: "Image upload car",
      location: `Images ${randomUUID()}`,
      status: "AVAILABLE",
    });
    expect(response.status).toBe(201);
    const carId = response.body.data.car.id as string;
    carIds.push(carId);
    return carId;
  }

  it("stores a valid image for the owner and an admin", async () => {
    const owner = await account();
    const admin = await account(UserRole.ADMIN);
    const carId = await createCar(owner.token);

    const uploaded = await request(app)
      .post(`/api/v1/cars/${carId}/images`)
      .set(auth(owner.token))
      .attach("image", png(320, 240), { filename: "../../secret.png", contentType: "image/png" });
    expect(uploaded.status).toBe(201);
    const image = uploaded.body.data.image as { id: string; url: string; storageKey?: string };
    expect(image.url).toMatch(/^\/uploads\/car-images\/[0-9a-f-]{36}\.png$/);
    expect(image.url).not.toContain("secret");
    expect(image.storageKey).toBeUndefined();
    await expect(access(storedPath(image.url))).resolves.toBeUndefined();

    const row = await PrismaService.client().carImage.findUnique({ where: { id: image.id } });
    expect(row?.storageKey).toMatch(/^car-images\/[0-9a-f-]{36}\.png$/);
    expect(row?.metadata).toMatchObject({ mime: "image/png", width: 320, height: 240 });
    expect(JSON.stringify(row?.metadata)).not.toContain("secret");

    const byAdmin = await request(app)
      .post(`/api/v1/cars/${carId}/images`)
      .set(auth(admin.token))
      .attach("image", png(400, 300), { filename: "admin.png", contentType: "image/png" });
    expect(byAdmin.status).toBe(201);
  });

  it("rejects an invalid MIME type, extension, and oversized file", async () => {
    const owner = await account();
    const carId = await createCar(owner.token);
    const image = png(300, 300);

    const mime = await request(app)
      .post(`/api/v1/cars/${carId}/images`)
      .set(auth(owner.token))
      .attach("image", image, { filename: "photo.png", contentType: "image/gif" });
    expect(mime.status).toBe(422);
    expect(mime.body.code).toBe("INVALID_IMAGE");

    const extension = await request(app)
      .post(`/api/v1/cars/${carId}/images`)
      .set(auth(owner.token))
      .attach("image", image, { filename: "payload.exe", contentType: "image/png" });
    expect(extension.status).toBe(422);
    expect(extension.body.code).toBe("INVALID_IMAGE");

    const oversized = await request(app)
      .post(`/api/v1/cars/${carId}/images`)
      .set(auth(owner.token))
      .attach("image", Buffer.alloc(MAX_IMAGE_BYTES + 1), { filename: "big.png", contentType: "image/png" });
    expect(oversized.status).toBe(422);
    expect(oversized.body.code).toBe("INVALID_IMAGE");

    const count = await PrismaService.client().carImage.count({ where: { carId } });
    expect(count).toBe(0);
  });

  it("rejects guests and other users, and lets only the owner delete", async () => {
    const owner = await account();
    const other = await account();
    const carId = await createCar(owner.token);

    const guest = await request(app)
      .post(`/api/v1/cars/${carId}/images`)
      .attach("image", png(300, 300), { filename: "photo.png", contentType: "image/png" });
    expect(guest.status).toBe(401);

    const foreign = await request(app)
      .post(`/api/v1/cars/${carId}/images`)
      .set(auth(other.token))
      .attach("image", png(300, 300), { filename: "photo.png", contentType: "image/png" });
    expect(foreign.status).toBe(404);

    const uploaded = await request(app)
      .post(`/api/v1/cars/${carId}/images`)
      .set(auth(owner.token))
      .attach("image", png(300, 300), { filename: "photo.png", contentType: "image/png" });
    expect(uploaded.status).toBe(201);
    const imageId = uploaded.body.data.image.id as string;
    const url = uploaded.body.data.image.url as string;

    const denied = await request(app).delete(`/api/v1/cars/${carId}/images/${imageId}`).set(auth(other.token));
    expect(denied.status).toBe(404);
    await expect(access(storedPath(url))).resolves.toBeUndefined();

    const removed = await request(app).delete(`/api/v1/cars/${carId}/images/${imageId}`).set(auth(owner.token));
    expect(removed.status).toBe(200);
    const row = await PrismaService.client().carImage.findUnique({ where: { id: imageId } });
    expect(row).toBeNull();
    await expect(access(storedPath(url))).rejects.toThrow();
  });

  it("lets the owner or an admin set the main image and reorder the rest", async () => {
    const owner = await account();
    const admin = await account(UserRole.ADMIN);
    const other = await account();
    const carId = await createCar(owner.token);

    const ids: string[] = [];
    for (const name of ["first.png", "second.png", "third.png"]) {
      const uploaded = await request(app)
        .post(`/api/v1/cars/${carId}/images`)
        .set(auth(owner.token))
        .attach("image", png(300, 220), { filename: name, contentType: "image/png" });
      expect(uploaded.status).toBe(201);
      expect(uploaded.body.data.image.storageKey).toBeUndefined();
      ids.push(uploaded.body.data.image.id as string);
    }

    const guest = await request(app).patch(`/api/v1/cars/${carId}/images/${ids[2]}/main`);
    const stranger = await request(app)
      .patch(`/api/v1/cars/${carId}/images/${ids[2]}/main`)
      .set(auth(other.token));
    expect(guest.status).toBe(401);
    expect(stranger.status).toBe(404);

    const main = await request(app).patch(`/api/v1/cars/${carId}/images/${ids[2]}/main`).set(auth(owner.token));
    expect(main.status).toBe(200);
    expect(JSON.stringify(main.body)).not.toContain("storageKey");
    expect(main.body.data.images.map((image: { id: string; sortOrder: number }) => [image.id, image.sortOrder])).toEqual([
      [ids[2], 0],
      [ids[0], 1],
      [ids[1], 2],
    ]);

    const missing = await request(app)
      .patch(`/api/v1/cars/${carId}/images/order`)
      .set(auth(owner.token))
      .send({ imageIds: [ids[0], ids[1]] });
    expect(missing.status).toBe(422);

    const duplicate = await request(app)
      .patch(`/api/v1/cars/${carId}/images/order`)
      .set(auth(owner.token))
      .send({ imageIds: [ids[0], ids[0], ids[1]] });
    expect(duplicate.status).toBe(422);

    const foreignOrder = await request(app)
      .patch(`/api/v1/cars/${carId}/images/order`)
      .set(auth(other.token))
      .send({ imageIds: [ids[1], ids[0], ids[2]] });
    expect(foreignOrder.status).toBe(404);

    const ordered = await request(app)
      .patch(`/api/v1/cars/${carId}/images/order`)
      .set(auth(admin.token))
      .send({ imageIds: [ids[1], ids[0], ids[2]] });
    expect(ordered.status).toBe(200);
    expect(JSON.stringify(ordered.body)).not.toContain("storageKey");
    expect(ordered.body.data.images.map((image: { id: string; sortOrder: number }) => [image.id, image.sortOrder])).toEqual([
      [ids[1], 0],
      [ids[0], 1],
      [ids[2], 2],
    ]);

    const stored = await PrismaService.client().carImage.findMany({
      where: { carId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, sortOrder: true, storageKey: true },
    });
    expect(stored.map((image) => image.id)).toEqual([ids[1], ids[0], ids[2]]);
    expect(stored.every((image) => image.storageKey.length > 0)).toBe(true);
  });
});
