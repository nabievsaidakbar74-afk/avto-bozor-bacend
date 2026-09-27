import { randomInt, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../src/infrastructure/prisma/prisma.service.js";

const createdUserIds: string[] = [];

function phone(): string {
  return `+99881${randomInt(1_000_000, 10_000_000).toString()}`;
}

function isKnown(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError;
}

describe("database constraints", () => {
  afterAll(async () => {
    await PrismaService.client().favorite.deleteMany({ where: { userId: { in: createdUserIds } } });
    await PrismaService.client().review.deleteMany({
      where: { OR: [{ authorId: { in: createdUserIds } }, { targetUserId: { in: createdUserIds } }] },
    });
    await PrismaService.client().purchase.deleteMany({
      where: { OR: [{ buyerId: { in: createdUserIds } }, { sellerId: { in: createdUserIds } }] },
    });
    await PrismaService.client().car.deleteMany({ where: { ownerId: { in: createdUserIds } } });
    await PrismaService.client().user.deleteMany({ where: { id: { in: createdUserIds } } });
    await PrismaService.disconnect();
  });

  async function user(label: string): Promise<string> {
    const created = await PrismaService.client().user.create({
      data: {
        email: `db.${label}.${randomUUID()}@example.com`,
        phone: phone(),
        passwordHash: "not-a-login-hash",
        firstName: "Db",
        lastName: label,
      },
      select: { id: true },
    });
    createdUserIds.push(created.id);
    return created.id;
  }

  async function car(ownerId: string): Promise<string> {
    const created = await PrismaService.client().car.create({
      data: {
        ownerId,
        brand: "Db",
        model: "Constraint",
        year: 2022,
        price: "1000.00",
        mileage: 10,
        fuelType: "PETROL",
        transmission: "MANUAL",
        bodyType: "SEDAN",
        color: "White",
        engine: "1.5",
        description: "Constraint fixture",
        location: "Tashkent",
      },
      select: { id: true },
    });
    return created.id;
  }

  it("runs against the test database", async () => {
    const rows = await PrismaService.client().$queryRaw<Array<{ name: string }>>`
      SELECT current_database() AS name
    `;
    expect(rows[0]?.name).toBe("avto_bozor_test");
  });

  it("rejects a duplicate email and a car whose owner does not exist", async () => {
    const ownerId = await user("unique");
    const existing = await PrismaService.client().user.findUniqueOrThrow({
      where: { id: ownerId },
      select: { email: true },
    });

    const duplicate = PrismaService.client().user.create({
      data: {
        email: existing.email,
        phone: phone(),
        passwordHash: "not-a-login-hash",
        firstName: "Db",
        lastName: "Duplicate",
      },
    });
    await expect(duplicate).rejects.toSatisfy(isKnown);
    await duplicate.catch((error: unknown) => {
      expect(isKnown(error) ? error.code : "").toBe("P2002");
    });

    const missingOwner = PrismaService.client().car.create({
      data: {
        ownerId: randomUUID(),
        brand: "Db",
        model: "Missing",
        year: 2022,
        price: "1000.00",
        mileage: 10,
        fuelType: "PETROL",
        transmission: "MANUAL",
        bodyType: "SEDAN",
        color: "White",
        engine: "1.5",
        description: "Missing owner",
        location: "Tashkent",
      },
    });
    await expect(missingOwner).rejects.toSatisfy(isKnown);
    await missingOwner.catch((error: unknown) => {
      expect(isKnown(error) ? error.code : "").toBe("P2003");
    });
  });

  it("rolls back a transaction when a later statement fails", async () => {
    const email = `db.rollback.${randomUUID()}@example.com`;

    await expect(
      PrismaService.client().$transaction(async (tx) => {
        await tx.user.create({
          data: {
            email,
            phone: phone(),
            passwordHash: "not-a-login-hash",
            firstName: "Db",
            lastName: "Rollback",
          },
        });
        throw new Error("force rollback");
      }),
    ).rejects.toThrow("force rollback");

    expect(await PrismaService.client().user.findUnique({ where: { email } })).toBeNull();
  });

  it("cascades favorites, blocks owner deletion, and keeps one concurrent favorite", async () => {
    const ownerId = await user("owner");
    const fanId = await user("fan");
    const carId = await car(ownerId);

    const [first, second] = await Promise.allSettled([
      PrismaService.client().favorite.create({ data: { userId: fanId, carId } }),
      PrismaService.client().favorite.create({ data: { userId: fanId, carId } }),
    ]);
    const fulfilled = [first, second].filter((result) => result.status === "fulfilled");
    const rejectedResult = [first, second].find((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejectedResult?.status).toBe("rejected");
    if (rejectedResult?.status === "rejected") {
      expect(isKnown(rejectedResult.reason) ? rejectedResult.reason.code : "").toBe("P2002");
    }

    const blocked = PrismaService.client().user.delete({ where: { id: ownerId } });
    await expect(blocked).rejects.toSatisfy(isKnown);
    await blocked.catch((error: unknown) => {
      expect(isKnown(error) ? error.code : "").toBe("P2003");
    });

    await PrismaService.client().car.delete({ where: { id: carId } });
    expect(await PrismaService.client().favorite.count({ where: { carId } })).toBe(0);
  });

  it("rejects a review outside the rating check and a self-review", async () => {
    const sellerId = await user("seller");
    const buyerId = await user("buyer");
    const carId = await car(sellerId);
    const purchase = await PrismaService.client().purchase.create({
      data: {
        buyerId,
        sellerId,
        carId,
        price: "1000.00",
        status: "COMPLETED",
        completedCarId: carId,
      },
      select: { id: true },
    });

    const outOfRange = PrismaService.client().review.create({
      data: {
        authorId: buyerId,
        targetUserId: sellerId,
        carId,
        purchaseId: purchase.id,
        rating: 0,
        comment: "Out of range",
      },
    });
    await expect(outOfRange).rejects.toBeTruthy();

    const selfReview = PrismaService.client().review.create({
      data: {
        authorId: buyerId,
        targetUserId: buyerId,
        carId,
        purchaseId: purchase.id,
        rating: 5,
        comment: "Self review",
      },
    });
    await expect(selfReview).rejects.toBeTruthy();

    expect(await PrismaService.client().review.count({ where: { purchaseId: purchase.id } })).toBe(0);
  });
});
