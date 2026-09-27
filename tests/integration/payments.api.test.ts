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
  return `+99877${randomInt(1_000_000, 10_000_000).toString()}`;
}

function auth(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

describe("payments", () => {
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
      where: { OR: [{ purchaseId: { in: purchaseIds } }, { bookingId: { in: bookingIds } }, { userId: { in: userIds } }] },
    });
    await PrismaService.client().purchase.deleteMany({ where: { id: { in: purchaseIds } } });
    await PrismaService.client().rentalBooking.deleteMany({ where: { id: { in: bookingIds } } });
    await PrismaService.client().listing.deleteMany({ where: { ownerId: { in: userIds } } });
    await PrismaService.client().car.deleteMany({ where: { ownerId: { in: userIds } } });
    await PrismaService.client().user.deleteMany({ where: { id: { in: userIds } } });
    await PrismaService.disconnect();
  });

  async function account(role: UserRole = UserRole.USER): Promise<{ id: string; token: string }> {
    const email = `pay.${randomUUID()}@example.com`;
    const user = await PrismaService.client().user.create({
      data: {
        email,
        phone: uniquePhone(),
        passwordHash,
        firstName: "Pay",
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
        brand: "Nexia",
        model: "Pay",
        year: 2019,
        price: "8000.00",
        mileage: 70000,
        fuelType: "PETROL",
        transmission: "MANUAL",
        bodyType: "SEDAN",
        color: "White",
        engine: "1.5",
        description: "Payment test car",
        location: `Pay ${randomUUID()}`,
        status: "AVAILABLE",
      });
    expect(created.status).toBe(201);
    return created.body.data.car.id as string;
  }

  async function publishedSale(token: string, salePrice: string): Promise<string> {
    const carId = await carFor(token);
    const listing = await request(app).post("/api/v1/listings").set(auth(token)).send({
      carId,
      type: "SALE",
      title: `Pay sale ${randomUUID()}`,
      description: "Sale for payment",
      salePrice,
    });
    expect(listing.status).toBe(201);
    await PrismaService.client().listing.update({
      where: { id: listing.body.data.listing.id as string },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    return carId;
  }

  it("creates a purchase payment from the server price and rejects a second one", async () => {
    const seller = await account();
    const buyer = await account();
    const stranger = await account();
    const admin = await account(UserRole.ADMIN);
    const carId = await publishedSale(seller.token, "18000.00");

    const purchase = await request(app).post("/api/v1/purchases").set(auth(buyer.token)).send({ carId });
    expect(purchase.status).toBe(201);
    expect(purchase.body.data.purchase.payment.amount).toBe("18000.00");
    expect(purchase.body.data.purchase.payment.currency).toBe("UZS");
    expect(purchase.body.data.purchase.payment.status).toBe("PENDING");
    expect(purchase.body.data.purchase.payment.provider).toBe("manual");
    const paymentId = purchase.body.data.purchase.payment.id as string;
    const purchaseId = purchase.body.data.purchase.id as string;

    const before = await PrismaService.client().payment.count({ where: { purchaseId } });
    const manipulated = await request(app)
      .post("/api/v1/payments")
      .set(auth(buyer.token))
      .send({ purchaseId, amount: "1.00", currency: "USD", userId: seller.id, cardNumber: "4242424242424242", cvv: "123" });
    expect(manipulated.status).toBe(422);
    expect(await PrismaService.client().payment.count({ where: { purchaseId } })).toBe(before);

    const duplicate = await request(app).post("/api/v1/payments").set(auth(buyer.token)).send({ purchaseId });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe("DUPLICATE_PAYMENT");

    const guest = await request(app).get(`/api/v1/payments/${paymentId}`);
    const hidden = await request(app).get(`/api/v1/payments/${paymentId}`).set(auth(stranger.token));
    const sellerView = await request(app).get(`/api/v1/payments/${paymentId}`).set(auth(seller.token));
    const buyerView = await request(app).get(`/api/v1/payments/${paymentId}`).set(auth(buyer.token));
    expect(guest.status).toBe(401);
    expect(hidden.status).toBe(404);
    expect(sellerView.status).toBe(404);
    expect(buyerView.status).toBe(200);
    expect(buyerView.body.data.payment.amount).toBe("18000.00");
    expect(JSON.stringify(buyerView.body)).not.toMatch(/passwordHash|cardNumber|cvv/i);

    const mine = await request(app).get("/api/v1/my/payments").set(auth(buyer.token));
    const sellerPayments = await request(app).get("/api/v1/my/payments").set(auth(seller.token));
    expect(mine.body.data.payments.map((item: { id: string }) => item.id)).toContain(paymentId);
    expect(sellerPayments.body.data.payments.map((item: { id: string }) => item.id)).not.toContain(paymentId);

    const userAdmin = await request(app).get("/api/v1/admin/payments").set(auth(buyer.token));
    const staff = await request(app).get("/api/v1/admin/payments").set(auth(admin.token));
    expect(userAdmin.status).toBe(403);
    expect(staff.status).toBe(200);
    expect(staff.body.data.payments.map((item: { id: string }) => item.id)).toContain(paymentId);

    const earlyPay = await request(app).post(`/api/v1/payments/${paymentId}/pay`).set(auth(buyer.token));
    expect(earlyPay.status).toBe(409);

    expect((await request(app).post(`/api/v1/purchases/${purchaseId}/confirm`).set(auth(seller.token))).status).toBe(200);
    const sellerPay = await request(app).post(`/api/v1/payments/${paymentId}/pay`).set(auth(seller.token));
    expect(sellerPay.status).toBe(404);
    const paid = await request(app).post(`/api/v1/payments/${paymentId}/pay`).set(auth(buyer.token));
    expect(paid.status).toBe(200);
    expect(paid.body.data.payment.status).toBe("PAID");
    expect(paid.body.data.payment.amount).toBe("18000.00");
    expect(paid.body.data.payment.providerTransactionId).toBe(`manual_${purchaseId}`);
    const purchaseRow = await PrismaService.client().purchase.findUnique({ where: { id: purchaseId } });
    expect(purchaseRow?.status).toBe("PAID");

    const payAgain = await request(app).post(`/api/v1/payments/${paymentId}/pay`).set(auth(buyer.token));
    expect(payAgain.status).toBe(409);
    expect(payAgain.body.code).toBe("INVALID_STATUS_TRANSITION");

    const userRefund = await request(app).post(`/api/v1/admin/payments/${paymentId}/refund`).set(auth(buyer.token));
    expect(userRefund.status).toBe(403);
    const refunded = await request(app).post(`/api/v1/admin/payments/${paymentId}/refund`).set(auth(admin.token));
    expect(refunded.status).toBe(200);
    expect(refunded.body.data.payment.status).toBe("REFUNDED");
    const released = await PrismaService.client().car.findUnique({ where: { id: carId } });
    const listing = await PrismaService.client().listing.findFirst({ where: { carId, type: "SALE" } });
    expect(released?.status).toBe("AVAILABLE");
    expect(listing?.status).toBe("PUBLISHED");
  });

  it("charges a confirmed booking its server total and cancels that payment with the booking", async () => {
    const owner = await account();
    const renter = await account();
    const carId = await carFor(owner.token);
    const rental = await request(app).post("/api/v1/rentals").set(auth(owner.token)).send({
      carId,
      description: "Paid rental",
      dailyPrice: "25.50",
    });
    expect(rental.status).toBe(201);
    await PrismaService.client().listing.update({
      where: { id: rental.body.data.listing.id as string },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    const booking = await request(app)
      .post("/api/v1/bookings")
      .set(auth(renter.token))
      .send({ carId, startDate: "2026-10-01", endDate: "2026-10-05" });
    expect(booking.status).toBe(201);
    expect(booking.body.data.booking.totalPrice).toBe("102.00");
    const bookingId = booking.body.data.booking.id as string;

    const tooEarly = await request(app).post("/api/v1/payments").set(auth(renter.token)).send({ bookingId });
    expect(tooEarly.status).toBe(409);
    expect(tooEarly.body.code).toBe("PAYMENT_NOT_READY");

    expect((await request(app).post(`/api/v1/bookings/${bookingId}/confirm`).set(auth(owner.token))).status).toBe(200);
    const ownerCreate = await request(app).post("/api/v1/payments").set(auth(owner.token)).send({ bookingId });
    expect(ownerCreate.status).toBe(403);

    const created = await request(app).post("/api/v1/payments").set(auth(renter.token)).send({ bookingId });
    expect(created.status).toBe(201);
    expect(created.body.data.payment.amount).toBe("102.00");
    expect(created.body.data.payment.userId).toBe(renter.id);
    expect(created.body.data.payment.bookingId).toBe(bookingId);
    const paymentId = created.body.data.payment.id as string;

    const duplicate = await request(app).post("/api/v1/payments").set(auth(renter.token)).send({ bookingId });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe("DUPLICATE_PAYMENT");
    expect(await PrismaService.client().payment.count({ where: { bookingId } })).toBe(1);

    const cancelled = await request(app).post(`/api/v1/payments/${paymentId}/cancel`).set(auth(renter.token));
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.payment.status).toBe("CANCELLED");
    const bookingRow = await PrismaService.client().rentalBooking.findUnique({ where: { id: bookingId } });
    expect(bookingRow?.status).toBe("CANCELLED");

    const cancelAgain = await request(app).post(`/api/v1/payments/${paymentId}/cancel`).set(auth(renter.token));
    expect(cancelAgain.status).toBe(409);
    expect(cancelAgain.body.code).toBe("INVALID_STATUS_TRANSITION");
  });
});
