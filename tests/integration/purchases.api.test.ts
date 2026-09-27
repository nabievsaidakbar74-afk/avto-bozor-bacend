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
  return `+99873${randomInt(1_000_000, 10_000_000).toString()}`;
}

function auth(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

describe("car purchases", () => {
  const app = createApp();
  let passwordHash = "";

  beforeAll(async () => {
    passwordHash = await hashPassword(password);
  });

  afterAll(async () => {
    const purchases = await PrismaService.client().purchase.findMany({
      where: {
        OR: [{ buyerId: { in: userIds } }, { sellerId: { in: userIds } }],
      },
      select: { id: true },
    });
    const purchaseIds = purchases.map((purchase) => purchase.id);
    await PrismaService.client().payment.deleteMany({
      where: { purchaseId: { in: purchaseIds } },
    });
    await PrismaService.client().purchase.deleteMany({ where: { id: { in: purchaseIds } } });
    await PrismaService.client().listing.deleteMany({ where: { ownerId: { in: userIds } } });
    await PrismaService.client().car.deleteMany({ where: { ownerId: { in: userIds } } });
    await PrismaService.client().user.deleteMany({ where: { id: { in: userIds } } });
    await PrismaService.disconnect();
  });

  async function account(role: UserRole): Promise<{ id: string; token: string }> {
    const email = `sale.${randomUUID()}@example.com`;
    const user = await PrismaService.client().user.create({
      data: {
        email,
        phone: uniquePhone(),
        passwordHash,
        firstName: "Buyer",
        lastName: "Account",
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

  async function listedCar(
    token: string,
    options: { salePrice?: string; publish?: boolean; carStatus?: "AVAILABLE" | "SOLD" } = {},
  ): Promise<{ carId: string; listingId: string }> {
    const location = `Sale ${randomUUID()}`;
    const car = await request(app)
      .post("/api/v1/cars")
      .set(auth(token))
      .send({
        brand: "Malibu",
        model: "XL",
        year: 2021,
        price: "30000.00",
        mileage: 15000,
        fuelType: "PETROL",
        transmission: "AUTOMATIC",
        bodyType: "SEDAN",
        color: "Black",
        engine: "2.0",
        description: "Listed for sale",
        location,
        status: "AVAILABLE",
      });
    expect(car.status).toBe(201);
    const carId = car.body.data.car.id as string;
    const listing = await request(app)
      .post("/api/v1/listings")
      .set(auth(token))
      .send({
        carId,
        type: "SALE",
        title: `Sale ${randomUUID()}`,
        description: "Published sale",
        salePrice: options.salePrice ?? "18000.00",
      });
    expect(listing.status).toBe(201);
    const listingId = listing.body.data.listing.id as string;
    if (options.publish !== false) {
      await PrismaService.client().listing.update({
        where: { id: listingId },
        data: { status: "PUBLISHED", publishedAt: new Date() },
      });
    }
    if (options.carStatus === "SOLD") {
      await PrismaService.client().car.update({
        where: { id: carId },
        data: { status: "SOLD" },
      });
    }
    return { carId, listingId };
  }

  it("creates a purchase from the database price and keeps it private", async () => {
    const seller = await account(UserRole.USER);
    const buyer = await account(UserRole.USER);
    const stranger = await account(UserRole.USER);
    const admin = await account(UserRole.ADMIN);
    const { carId } = await listedCar(seller.token, { salePrice: "18000.00" });

    const guest = await request(app).post("/api/v1/purchases").send({ carId });
    expect(guest.status).toBe(401);

    const created = await request(app).post("/api/v1/purchases").set(auth(buyer.token)).send({ carId });
    expect(created.status).toBe(201);
    expect(created.body.data.purchase.price).toBe("18000.00");
    expect(created.body.data.purchase.buyerId).toBe(buyer.id);
    expect(created.body.data.purchase.sellerId).toBe(seller.id);
    expect(created.body.data.purchase.status).toBe("PENDING");
    expect(created.body.data.purchase.payment.amount).toBe("18000.00");
    expect(created.body.data.purchase.payment.provider).toBe("manual");
    expect(JSON.stringify(created.body)).not.toMatch(/passwordHash|refreshToken|email|phone/i);
    const purchaseId = created.body.data.purchase.id as string;

    const car = await PrismaService.client().car.findUnique({ where: { id: carId } });
    const listing = await PrismaService.client().listing.findFirst({ where: { carId } });
    expect(car?.status).toBe("RESERVED");
    expect(listing?.status).toBe("PUBLISHED");

    const purchases = await request(app).get("/api/v1/my/purchases").set(auth(buyer.token));
    const sales = await request(app).get("/api/v1/my/sales").set(auth(seller.token));
    const buyerSales = await request(app).get("/api/v1/my/sales").set(auth(buyer.token));
    expect(purchases.body.data.purchases.map((item: { id: string }) => item.id)).toContain(purchaseId);
    expect(sales.body.data.purchases.map((item: { id: string }) => item.id)).toContain(purchaseId);
    expect(buyerSales.body.data.purchases.map((item: { id: string }) => item.id)).not.toContain(purchaseId);

    const hidden = await request(app).get(`/api/v1/purchases/${purchaseId}`).set(auth(stranger.token));
    expect(hidden.status).toBe(404);

    const staff = await request(app).get("/api/v1/admin/sales").set(auth(admin.token));
    const denied = await request(app).get("/api/v1/admin/sales").set(auth(buyer.token));
    expect(staff.status).toBe(200);
    expect(staff.body.data.purchases.some((item: { id: string }) => item.id === purchaseId)).toBe(true);
    expect(denied.status).toBe(403);

    const skipped = await request(app)
      .patch(`/api/v1/admin/sales/${purchaseId}/status`)
      .set(auth(admin.token))
      .send({ status: "COMPLETED" });
    expect(skipped.status).toBe(409);
    expect(skipped.body.code).toBe("INVALID_STATUS_TRANSITION");
  });

  it("rejects buying your own car, a sold car, an inactive listing, and a second purchase", async () => {
    const seller = await account(UserRole.USER);
    const buyer = await account(UserRole.USER);
    const own = await listedCar(seller.token);
    const ownPurchase = await request(app).post("/api/v1/purchases").set(auth(seller.token)).send({ carId: own.carId });
    expect(ownPurchase.status).toBe(409);
    expect(ownPurchase.body.code).toBe("BUYER_IS_OWNER");

    const sold = await listedCar(seller.token, { carStatus: "SOLD" });
    const soldPurchase = await request(app)
      .post("/api/v1/purchases")
      .set(auth(buyer.token))
      .send({ carId: sold.carId });
    expect(soldPurchase.status).toBe(409);
    expect(soldPurchase.body.code).toBe("CAR_NOT_AVAILABLE");

    const inactive = await listedCar(seller.token, { publish: false });
    const inactivePurchase = await request(app)
      .post("/api/v1/purchases")
      .set(auth(buyer.token))
      .send({ carId: inactive.carId });
    expect(inactivePurchase.status).toBe(409);
    expect(inactivePurchase.body.code).toBe("LISTING_NOT_ACTIVE");

    const available = await listedCar(seller.token, { salePrice: "17500.50" });
    const manipulated = await request(app)
      .post("/api/v1/purchases")
      .set(auth(buyer.token))
      .send({
        carId: available.carId,
        price: "1.00",
        totalPrice: "1.00",
        buyerId: seller.id,
        sellerId: buyer.id,
        ownerId: buyer.id,
      });
    expect(manipulated.status).toBe(422);
    expect(
      await PrismaService.client().purchase.count({ where: { carId: available.carId } }),
    ).toBe(0);

    const first = await request(app)
      .post("/api/v1/purchases")
      .set(auth(buyer.token))
      .send({ carId: available.carId });
    expect(first.status).toBe(201);
    expect(first.body.data.purchase.price).toBe("17500.50");

    const other = await account(UserRole.USER);
    const second = await request(app)
      .post("/api/v1/purchases")
      .set(auth(other.token))
      .send({ carId: available.carId });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("CAR_NOT_AVAILABLE");
  });

  it("lets only one of two concurrent purchases succeed", async () => {
    const seller = await account(UserRole.USER);
    const firstBuyer = await account(UserRole.USER);
    const secondBuyer = await account(UserRole.USER);
    const { carId } = await listedCar(seller.token, { salePrice: "16000.00" });

    const [first, second] = await Promise.all([
      request(app).post("/api/v1/purchases").set(auth(firstBuyer.token)).send({ carId }),
      request(app).post("/api/v1/purchases").set(auth(secondBuyer.token)).send({ carId }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);
    expect(await PrismaService.client().purchase.count({ where: { carId } })).toBe(1);
    const winner = first.status === 201 ? first : second;
    expect(winner.body.data.purchase.price).toBe("16000.00");
    expect([firstBuyer.id, secondBuyer.id]).toContain(winner.body.data.purchase.buyerId);
  });
});
