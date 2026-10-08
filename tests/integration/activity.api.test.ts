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
  return `+99875${randomInt(1_000_000, 10_000_000).toString()}`;
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

describe("favorites, reviews, and notifications", () => {
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
    await PrismaService.client().review.deleteMany({
      where: {
        OR: [{ authorId: { in: userIds } }, { targetUserId: { in: userIds } }],
      },
    });
    await PrismaService.client().payment.deleteMany({
      where: { OR: [{ purchaseId: { in: purchaseIds } }, { bookingId: { in: bookingIds } }] },
    });
    await PrismaService.client().purchase.deleteMany({ where: { id: { in: purchaseIds } } });
    await PrismaService.client().rentalBooking.deleteMany({ where: { id: { in: bookingIds } } });
    await PrismaService.client().listing.deleteMany({ where: { ownerId: { in: userIds } } });
    await PrismaService.client().car.deleteMany({ where: { ownerId: { in: userIds } } });
    await PrismaService.client().user.deleteMany({ where: { id: { in: userIds } } });
    await PrismaService.disconnect();
  });

  async function account(role: UserRole = UserRole.USER): Promise<{ id: string; token: string }> {
    const email = `activity.${randomUUID()}@example.com`;
    const user = await PrismaService.client().user.create({
      data: {
        email,
        phone: uniquePhone(),
        passwordHash,
        firstName: "Activity",
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

  async function carFor(token: string): Promise<string> {
    const created = await request(app)
      .post("/api/v1/cars")
      .set(auth(token))
      .send({
        brand: "Spark",
        model: "Favorite",
        year: 2020,
        price: "9000.00",
        mileage: 50000,
        fuelType: "PETROL",
        transmission: "MANUAL",
        bodyType: "HATCHBACK",
        color: "Blue",
        engine: "1.2",
        description: "A car people can save",
        location: "Bukhara",
        status: "AVAILABLE",
      });
    expect(created.status).toBe(201);
    return created.body.data.car.id as string;
  }

  async function publishedSale(token: string): Promise<string> {
    const carId = await carFor(token);
    const listing = await request(app).post("/api/v1/listings").set(auth(token)).send({
      carId,
      type: "SALE",
      title: `Sale ${randomUUID()}`,
      description: "Published sale",
      salePrice: "8000.00",
    });
    expect(listing.status).toBe(201);
    await PrismaService.client().listing.update({
      where: { id: listing.body.data.listing.id as string },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    return carId;
  }

  async function completePurchase(sellerToken: string, buyerToken: string, carId: string): Promise<string> {
    const created = await request(app).post("/api/v1/purchases").set(auth(buyerToken)).send({ carId });
    expect(created.status).toBe(201);
    const purchaseId = created.body.data.purchase.id as string;
    expect((await request(app).post(`/api/v1/purchases/${purchaseId}/confirm`).set(auth(sellerToken))).status).toBe(200);
    expect((await request(app).post(`/api/v1/purchases/${purchaseId}/pay`).set(auth(buyerToken))).status).toBe(200);
    expect((await request(app).post(`/api/v1/purchases/${purchaseId}/complete`).set(auth(sellerToken))).status).toBe(200);
    return purchaseId;
  }

  it("saves a car once and keeps favorites private to the user", async () => {
    const owner = await account();
    const saver = await account();
    const other = await account();
    const carId = await carFor(owner.token);

    const guest = await request(app).post(`/api/v1/favorites/${carId}`);
    expect(guest.status).toBe(401);

    const missing = await request(app).post(`/api/v1/favorites/${randomUUID()}`).set(auth(saver.token));
    expect(missing.status).toBe(404);

    const saved = await request(app).post(`/api/v1/favorites/${carId}`).set(auth(saver.token));
    expect(saved.status).toBe(201);
    expect(saved.body.data.favorite.carId).toBe(carId);
    expect(saved.body.data.favorite.car.price).toBe("9000.00");
    expect(JSON.stringify(saved.body)).not.toMatch(/passwordHash|email|phone/i);

    const duplicate = await request(app).post(`/api/v1/favorites/${carId}`).set(auth(saver.token));
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe("DUPLICATE_FAVORITE");
    expect(await PrismaService.client().favorite.count({ where: { userId: saver.id, carId } })).toBe(1);

    const mine = await request(app).get("/api/v1/favorites").set(auth(saver.token));
    const theirs = await request(app).get("/api/v1/favorites").set(auth(other.token));
    expect(mine.body.data.favorites.map((item: { carId: string }) => item.carId)).toContain(carId);
    expect(theirs.body.data.favorites.map((item: { carId: string }) => item.carId)).not.toContain(carId);

    const foreignDelete = await request(app).delete(`/api/v1/favorites/${carId}`).set(auth(other.token));
    expect(foreignDelete.status).toBe(404);
    expect(await PrismaService.client().favorite.count({ where: { userId: saver.id, carId } })).toBe(1);

    const removed = await request(app).delete(`/api/v1/favorites/${carId}`).set(auth(saver.token));
    expect(removed.status).toBe(200);
    const again = await request(app).post(`/api/v1/favorites/${carId}`).set(auth(saver.token));
    expect(again.status).toBe(201);
  });

  it("allows one review per party after a completed purchase and rejects invalid reviews", async () => {
    const seller = await account();
    const buyer = await account();
    const stranger = await account();
    const carId = await publishedSale(seller.token);

    const pending = await request(app).post("/api/v1/purchases").set(auth(buyer.token)).send({ carId });
    expect(pending.status).toBe(201);
    const pendingId = pending.body.data.purchase.id as string;
    const tooEarly = await request(app)
      .post("/api/v1/reviews")
      .set(auth(buyer.token))
      .send({ purchaseId: pendingId, rating: 5, comment: "Too early" });
    expect(tooEarly.status).toBe(409);
    expect(tooEarly.body.code).toBe("REVIEW_NOT_ALLOWED");

    await request(app).post(`/api/v1/purchases/${pendingId}/cancel`).set(auth(buyer.token));
    const completedCarId = await publishedSale(seller.token);
    const purchaseId = await completePurchase(seller.token, buyer.token, completedCarId);

    const invalidRating = await request(app)
      .post("/api/v1/reviews")
      .set(auth(buyer.token))
      .send({ purchaseId, rating: 6, comment: "Too high" });
    const fractional = await request(app)
      .post("/api/v1/reviews")
      .set(auth(buyer.token))
      .send({ purchaseId, rating: 1.5, comment: "Not a whole star" });
    const empty = await request(app)
      .post("/api/v1/reviews")
      .set(auth(buyer.token))
      .send({ purchaseId, rating: 5, comment: " " });
    const injected = await request(app)
      .post("/api/v1/reviews")
      .set(auth(buyer.token))
      .send({ purchaseId, rating: 5, comment: "Injected", authorId: stranger.id, targetUserId: stranger.id });
    expect(invalidRating.status).toBe(422);
    expect(fractional.status).toBe(422);
    expect(empty.status).toBe(422);
    expect(injected.status).toBe(422);

    const hidden = await request(app)
      .post("/api/v1/reviews")
      .set(auth(stranger.token))
      .send({ purchaseId, rating: 1, comment: "Not my purchase" });
    expect(hidden.status).toBe(404);

    const buyerReview = await request(app)
      .post("/api/v1/reviews")
      .set(auth(buyer.token))
      .send({ purchaseId, rating: 5, comment: "Smooth purchase" });
    expect(buyerReview.status).toBe(201);
    expect(buyerReview.body.data.review.rating).toBe(5);
    expect(buyerReview.body.data.review.author.id).toBe(buyer.id);
    expect(JSON.stringify(buyerReview.body)).not.toMatch(/passwordHash|email|phone/i);

    const duplicate = await request(app)
      .post("/api/v1/reviews")
      .set(auth(buyer.token))
      .send({ purchaseId, rating: 4, comment: "Again" });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe("REVIEW_EXISTS");

    const sellerReview = await request(app)
      .post("/api/v1/reviews")
      .set(auth(seller.token))
      .send({ purchaseId, rating: 4, comment: "Reliable buyer" });
    expect(sellerReview.status).toBe(201);

    const listed = await request(app).get(`/api/v1/cars/${completedCarId}/reviews`);
    expect(listed.status).toBe(200);
    expect(listed.body.data.reviews).toHaveLength(2);
    expect(listed.body.data.reviews.map((item: { rating: number }) => item.rating).sort()).toEqual([4, 5]);
  });

  it("reviews a completed rental once per party", async () => {
    const owner = await account();
    const renter = await account();
    const carId = await carFor(owner.token);
    const rental = await request(app).post("/api/v1/rentals").set(auth(owner.token)).send({
      carId,
      description: "Weekend rental",
      dailyPrice: "30.00",
    });
    expect(rental.status).toBe(201);
    await PrismaService.client().listing.update({
      where: { id: rental.body.data.listing.id as string },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    const booking = await request(app)
      .post("/api/v1/bookings")
      .set(auth(renter.token))
      .send({ carId, startDate: "2026-12-01", endDate: "2026-12-04" });
    expect(booking.status).toBe(201);
    const bookingId = booking.body.data.booking.id as string;

    const early = await request(app)
      .post("/api/v1/reviews")
      .set(auth(renter.token))
      .send({ bookingId, rating: 5, comment: "Not finished" });
    expect(early.status).toBe(409);
    expect(early.body.code).toBe("REVIEW_NOT_ALLOWED");

    expect((await request(app).post(`/api/v1/bookings/${bookingId}/confirm`).set(auth(owner.token))).status).toBe(200);
    const payment = await request(app).post("/api/v1/payments").set(auth(renter.token)).send({ bookingId });
    expect(payment.status).toBe(201);
    const paid = await request(app)
      .post(`/api/v1/payments/${payment.body.data.payment.id as string}/pay`)
      .set(auth(renter.token));
    expect(paid.status).toBe(200);
    expect((await PrismaService.client().car.findUnique({ where: { id: carId } }))?.status).toBe("RENTED");
    expect((await PrismaService.client().listing.findFirst({ where: { carId, type: "RENT" } }))?.status).toBe("RENTED");
    const activeReview = await request(app)
      .post("/api/v1/reviews")
      .set(auth(renter.token))
      .send({ bookingId, rating: 5, comment: "Still active" });
    expect(activeReview.status).toBe(409);
    expect(activeReview.body.code).toBe("REVIEW_NOT_ALLOWED");

    const renterComplete = await request(app).post(`/api/v1/bookings/${bookingId}/complete`).set(auth(renter.token));
    expect(renterComplete.status).toBe(403);
    const completed = await request(app).post(`/api/v1/bookings/${bookingId}/complete`).set(auth(owner.token));
    expect(completed.status).toBe(200);
    expect(completed.body.data.booking.status).toBe("COMPLETED");
    expect((await PrismaService.client().car.findUnique({ where: { id: carId } }))?.status).toBe("AVAILABLE");
    expect((await PrismaService.client().listing.findFirst({ where: { carId, type: "RENT" } }))?.status).toBe(
      "PUBLISHED",
    );
    const created = await request(app)
      .post("/api/v1/reviews")
      .set(auth(renter.token))
      .send({ bookingId, rating: 5, comment: "Great rental" });
    expect(created.status).toBe(201);
    const again = await request(app)
      .post("/api/v1/reviews")
      .set(auth(renter.token))
      .send({ bookingId, rating: 3, comment: "Second try" });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("REVIEW_EXISTS");

    const ownerReview = await request(app)
      .post("/api/v1/reviews")
      .set(auth(owner.token))
      .send({ bookingId, rating: 5, comment: "Careful renter" });
    expect(ownerReview.status).toBe(201);
  });

  it("delivers event notifications only to the user they belong to", async () => {
    const seller = await account();
    const buyer = await account();
    const stranger = await account();
    const moderator = await account(UserRole.MODERATOR);
    const admin = await account(UserRole.ADMIN);
    const carId = await publishedSale(seller.token);

    const purchase = await request(app).post("/api/v1/purchases").set(auth(buyer.token)).send({ carId });
    expect(purchase.status).toBe(201);

    const buyerNotes = await request(app).get("/api/v1/notifications").set(auth(buyer.token));
    const sellerNotes = await request(app).get("/api/v1/notifications").set(auth(seller.token));
    const strangerNotes = await request(app).get("/api/v1/notifications").set(auth(stranger.token));
    expect(buyerNotes.status).toBe(200);
    const buyerPurchase = buyerNotes.body.data.notifications.find(
      (item: { type: string }) => item.type === "PURCHASE",
    ) as { id: string; read: boolean } | undefined;
    const sellerSale = sellerNotes.body.data.notifications.find(
      (item: { type: string }) => item.type === "SALE",
    ) as { id: string } | undefined;
    expect(buyerPurchase?.read).toBe(false);
    expect(sellerSale).toBeDefined();
    expect(
      strangerNotes.body.data.notifications.map((item: { id: string }) => item.id),
    ).not.toContain(buyerPurchase?.id);

    const stolen = await request(app)
      .patch(`/api/v1/notifications/${buyerPurchase?.id}/read`)
      .set(auth(seller.token));
    expect(stolen.status).toBe(404);
    expect(
      (await PrismaService.client().notification.findUnique({ where: { id: buyerPurchase?.id } }))?.read,
    ).toBe(false);

    const read = await request(app)
      .patch(`/api/v1/notifications/${buyerPurchase?.id}/read`)
      .set(auth(buyer.token));
    expect(read.status).toBe(200);
    expect(read.body.data.notification.read).toBe(true);

    const owner = await account();
    const renter = await account();
    const rentalCar = await carFor(owner.token);
    const rental = await request(app).post("/api/v1/rentals").set(auth(owner.token)).send({
      carId: rentalCar,
      description: "Notify me",
      dailyPrice: "20.00",
    });
    await PrismaService.client().listing.update({
      where: { id: rental.body.data.listing.id as string },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    const booking = await request(app)
      .post("/api/v1/bookings")
      .set(auth(renter.token))
      .send({ carId: rentalCar, startDate: "2026-11-10", endDate: "2026-11-12" });
    expect(booking.status).toBe(201);
    const renterNotes = await request(app).get("/api/v1/notifications").set(auth(renter.token));
    const ownerNotes = await request(app).get("/api/v1/notifications").set(auth(owner.token));
    expect(renterNotes.body.data.notifications.some((item: { type: string }) => item.type === "BOOKING")).toBe(true);
    expect(ownerNotes.body.data.notifications.some((item: { type: string }) => item.type === "RENTAL")).toBe(true);
    expect(ownerNotes.body.data.notifications.some((item: { type: string }) => item.type === "LISTING")).toBe(true);

    const reviewCar = await carFor(seller.token);
    const reviewPhoto = await request(app)
      .post(`/api/v1/cars/${reviewCar}/images`)
      .set(auth(seller.token))
      .attach("image", png(300, 300), { filename: "photo.png", contentType: "image/png" });
    expect(reviewPhoto.status).toBe(201);
    const pendingListing = await request(app).post("/api/v1/listings").set(auth(seller.token)).send({
      carId: reviewCar,
      type: "SALE",
      title: "Needs review",
      description: "Waiting on telegram",
      salePrice: "7000.00",
      status: "PENDING_MODERATION",
    });
    expect(pendingListing.body.data.listing.status).toBe("PENDING_MODERATION");
    const approved = await request(app)
      .post(`/api/v1/admin/listings/${pendingListing.body.data.listing.id as string}/approve`)
      .set(auth(moderator.token));
    expect(approved.status).toBe(200);
    const moderated = await request(app).get("/api/v1/notifications").set(auth(seller.token));
    expect(moderated.body.data.notifications.some((item: { type: string }) => item.type === "MODERATION")).toBe(true);
    const outsider = await request(app).get("/api/v1/notifications").set(auth(stranger.token));
    expect(outsider.body.data.notifications.some((item: { type: string }) => item.type === "MODERATION")).toBe(false);

    const statusChange = await request(app)
      .patch(`/api/v1/admin/users/${stranger.id}/status`)
      .set(auth(admin.token))
      .send({ status: "PENDING" });
    expect(statusChange.status).toBe(200);
    const systemNotes = await request(app).get("/api/v1/notifications").set(auth(stranger.token));
    expect(systemNotes.body.data.notifications.some((item: { type: string }) => item.type === "SYSTEM")).toBe(true);
    const adminNotes = await request(app).get("/api/v1/notifications").set(auth(admin.token));
    expect(adminNotes.body.data.notifications.some((item: { type: string }) => item.type === "SYSTEM")).toBe(false);

    const unread = await request(app).get("/api/v1/notifications?unread=true").set(auth(buyer.token));
    expect(unread.body.data.notifications.some((item: { id: string }) => item.id === buyerPurchase?.id)).toBe(false);
    const marked = await request(app).patch("/api/v1/notifications/read-all").set(auth(buyer.token));
    expect(marked.status).toBe(200);
    expect(
      await PrismaService.client().notification.count({ where: { userId: buyer.id, read: false } }),
    ).toBe(0);
    expect(
      await PrismaService.client().notification.count({ where: { userId: seller.id, read: false } }),
    ).toBeGreaterThan(0);
  });
});
