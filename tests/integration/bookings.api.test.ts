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
  return `+99874${randomInt(1_000_000, 10_000_000).toString()}`;
}

function auth(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

describe("rental bookings", () => {
  const app = createApp();
  let passwordHash = "";

  beforeAll(async () => {
    passwordHash = await hashPassword(password);
  });

  afterAll(async () => {
    const bookings = await PrismaService.client().rentalBooking.findMany({
      where: {
        OR: [{ renterId: { in: userIds } }, { ownerId: { in: userIds } }],
      },
      select: { id: true },
    });
    const bookingIds = bookings.map((booking) => booking.id);
    await PrismaService.client().payment.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await PrismaService.client().rentalBooking.deleteMany({ where: { id: { in: bookingIds } } });
    await PrismaService.client().listing.deleteMany({ where: { ownerId: { in: userIds } } });
    await PrismaService.client().car.deleteMany({ where: { ownerId: { in: userIds } } });
    await PrismaService.client().user.deleteMany({ where: { id: { in: userIds } } });
    await PrismaService.disconnect();
  });

  async function account(): Promise<{ id: string; token: string }> {
    const email = `rent.${randomUUID()}@example.com`;
    const user = await PrismaService.client().user.create({
      data: {
        email,
        phone: uniquePhone(),
        passwordHash,
        firstName: "Rental",
        lastName: "Account",
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

  async function carFor(token: string): Promise<string> {
    const created = await request(app)
      .post("/api/v1/cars")
      .set(auth(token))
      .send({
        brand: "Cobalt",
        model: "Rental",
        year: 2022,
        price: "12000.00",
        mileage: 40000,
        fuelType: "PETROL",
        transmission: "AUTOMATIC",
        bodyType: "SEDAN",
        color: "White",
        engine: "1.5",
        description: "Available to rent",
        location: "Samarkand",
        status: "AVAILABLE",
      });
    expect(created.status).toBe(201);
    return created.body.data.car.id as string;
  }

  async function publishedRental(
    token: string,
    options: { dailyPrice?: string; availableUntil?: string; publish?: boolean; carStatus?: "SOLD" } = {},
  ): Promise<{ carId: string; listingId: string }> {
    const carId = await carFor(token);
    const rental = await request(app)
      .post("/api/v1/rentals")
      .set(auth(token))
      .send({
        carId,
        description: "Daily city rental",
        dailyPrice: options.dailyPrice ?? "25.50",
        location: "Tashkent",
        ...(options.availableUntil ? { availableUntil: options.availableUntil } : {}),
      });
    expect(rental.status).toBe(201);
    const listingId = rental.body.data.listing.id as string;
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

  it("publishes a rental for the owner's car and calculates the booking price", async () => {
    const owner = await account();
    const renter = await account();
    const stranger = await account();
    const { carId, listingId } = await publishedRental(owner.token, { dailyPrice: "25.50" });

    const foreign = await request(app)
      .post("/api/v1/rentals")
      .set(auth(renter.token))
      .send({ carId, description: "Not mine", dailyPrice: "10.00" });
    expect(foreign.status).toBe(404);

    const injected = await request(app)
      .post("/api/v1/rentals")
      .set(auth(owner.token))
      .send({
        carId,
        description: "Injected owner",
        dailyPrice: "10.00",
        ownerId: renter.id,
      });
    expect(injected.status).toBe(422);

    const listing = await PrismaService.client().listing.findUnique({ where: { id: listingId } });
    expect(listing?.ownerId).toBe(owner.id);
    expect(listing?.status).toBe("PUBLISHED");
    expect(listing?.rentalDailyPrice?.toFixed(2)).toBe("25.50");

    const guest = await request(app)
      .post("/api/v1/bookings")
      .send({ carId, startDate: "2026-10-01", endDate: "2026-10-05" });
    expect(guest.status).toBe(401);

    const before = await PrismaService.client().rentalBooking.count({ where: { carId } });
    const manipulated = await request(app)
      .post("/api/v1/bookings")
      .set(auth(renter.token))
      .send({
        carId,
        startDate: "2026-10-01",
        endDate: "2026-10-05",
        dailyPrice: "1.00",
        totalPrice: "1.00",
        renterId: owner.id,
        ownerId: renter.id,
      });
    expect(manipulated.status).toBe(422);
    expect(await PrismaService.client().rentalBooking.count({ where: { carId } })).toBe(before);

    const created = await request(app)
      .post("/api/v1/bookings")
      .set(auth(renter.token))
      .send({ carId, startDate: "2026-10-01", endDate: "2026-10-05" });
    expect(created.status).toBe(201);
    expect(created.body.data.booking.numberOfDays).toBe(4);
    expect(created.body.data.booking.dailyPrice).toBe("25.50");
    expect(created.body.data.booking.totalPrice).toBe("102.00");
    expect(created.body.data.booking.renterId).toBe(renter.id);
    expect(created.body.data.booking.ownerId).toBe(owner.id);
    expect(created.body.data.booking.status).toBe("PENDING");
    expect(JSON.stringify(created.body)).not.toMatch(/passwordHash|refreshToken|email|phone/i);
    const bookingId = created.body.data.booking.id as string;

    const car = await PrismaService.client().car.findUnique({ where: { id: carId } });
    expect(car?.status).toBe("AVAILABLE");

    const mine = await request(app).get("/api/v1/my/bookings").set(auth(renter.token));
    const incoming = await request(app).get("/api/v1/my/rentals").set(auth(owner.token));
    const hiddenFromRenter = await request(app).get("/api/v1/my/rentals").set(auth(renter.token));
    expect(mine.body.data.bookings.map((item: { id: string }) => item.id)).toContain(bookingId);
    expect(incoming.body.data.bookings.map((item: { id: string }) => item.id)).toContain(bookingId);
    expect(hiddenFromRenter.body.data.bookings.map((item: { id: string }) => item.id)).not.toContain(bookingId);

    const strangerCancel = await request(app).post(`/api/v1/bookings/${bookingId}/cancel`).set(auth(stranger.token));
    const renterConfirm = await request(app).post(`/api/v1/bookings/${bookingId}/confirm`).set(auth(renter.token));
    expect(strangerCancel.status).toBe(404);
    expect(renterConfirm.status).toBe(403);

    const confirmed = await request(app).post(`/api/v1/bookings/${bookingId}/confirm`).set(auth(owner.token));
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data.booking.status).toBe("CONFIRMED");

    const again = await request(app).post(`/api/v1/bookings/${bookingId}/confirm`).set(auth(owner.token));
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("INVALID_STATUS_TRANSITION");
  });

  it("rejects overlapping confirmed and active bookings and allows a handoff", async () => {
    const owner = await account();
    const renter = await account();
    const other = await account();
    const { carId } = await publishedRental(owner.token);

    const first = await request(app)
      .post("/api/v1/bookings")
      .set(auth(renter.token))
      .send({ carId, startDate: "2026-10-01", endDate: "2026-10-05" });
    expect(first.status).toBe(201);
    const firstId = first.body.data.booking.id as string;
    const confirmed = await request(app).post(`/api/v1/bookings/${firstId}/confirm`).set(auth(owner.token));
    expect(confirmed.status).toBe(200);

    const overlap = await request(app)
      .post("/api/v1/bookings")
      .set(auth(other.token))
      .send({ carId, startDate: "2026-10-03", endDate: "2026-10-07" });
    expect(overlap.status).toBe(409);
    expect(overlap.body.code).toBe("BOOKING_OVERLAP");

    await PrismaService.client().rentalBooking.update({
      where: { id: firstId },
      data: { status: "ACTIVE" },
    });
    const activeOverlap = await request(app)
      .post("/api/v1/bookings")
      .set(auth(other.token))
      .send({ carId, startDate: "2026-10-04", endDate: "2026-10-06" });
    expect(activeOverlap.status).toBe(409);
    expect(activeOverlap.body.code).toBe("BOOKING_OVERLAP");

    const handoff = await request(app)
      .post("/api/v1/bookings")
      .set(auth(other.token))
      .send({ carId, startDate: "2026-10-05", endDate: "2026-10-08" });
    expect(handoff.status).toBe(201);
    const handoffId = handoff.body.data.booking.id as string;
    const handoffConfirmed = await request(app).post(`/api/v1/bookings/${handoffId}/confirm`).set(auth(owner.token));
    expect(handoffConfirmed.status).toBe(200);
    expect(handoffConfirmed.body.data.booking.status).toBe("CONFIRMED");
  });

  it("keeps pending requests from both becoming confirmed and frees dates after cancellation", async () => {
    const owner = await account();
    const firstRenter = await account();
    const secondRenter = await account();
    const { carId } = await publishedRental(owner.token);

    const first = await request(app)
      .post("/api/v1/bookings")
      .set(auth(firstRenter.token))
      .send({ carId, startDate: "2026-11-01", endDate: "2026-11-05" });
    const second = await request(app)
      .post("/api/v1/bookings")
      .set(auth(secondRenter.token))
      .send({ carId, startDate: "2026-11-03", endDate: "2026-11-07" });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const firstConfirmed = await request(app)
      .post(`/api/v1/bookings/${first.body.data.booking.id as string}/confirm`)
      .set(auth(owner.token));
    const secondConfirmed = await request(app)
      .post(`/api/v1/bookings/${second.body.data.booking.id as string}/confirm`)
      .set(auth(owner.token));
    expect(firstConfirmed.status).toBe(200);
    expect(secondConfirmed.status).toBe(409);
    expect(secondConfirmed.body.code).toBe("BOOKING_OVERLAP");

    const cancelled = await request(app)
      .post(`/api/v1/bookings/${first.body.data.booking.id as string}/cancel`)
      .set(auth(firstRenter.token));
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.booking.status).toBe("CANCELLED");

    const replacement = await request(app)
      .post("/api/v1/bookings")
      .set(auth(secondRenter.token))
      .send({ carId, startDate: "2026-11-01", endDate: "2026-11-05" });
    expect(replacement.status).toBe(201);
    const ownerCancel = await request(app)
      .post(`/api/v1/bookings/${replacement.body.data.booking.id as string}/cancel`)
      .set(auth(owner.token));
    expect(ownerCancel.status).toBe(200);
  });

  it("rejects the owner's own car, bad dates, inactive listings, and illegal status changes", async () => {
    const owner = await account();
    const renter = await account();
    const own = await publishedRental(owner.token);
    const ownBooking = await request(app)
      .post("/api/v1/bookings")
      .set(auth(owner.token))
      .send({ carId: own.carId, startDate: "2026-10-10", endDate: "2026-10-12" });
    expect(ownBooking.status).toBe(409);
    expect(ownBooking.body.code).toBe("RENTER_IS_OWNER");

    const sold = await publishedRental(owner.token, { carStatus: "SOLD" });
    const soldBooking = await request(app)
      .post("/api/v1/bookings")
      .set(auth(renter.token))
      .send({ carId: sold.carId, startDate: "2026-10-10", endDate: "2026-10-12" });
    expect(soldBooking.status).toBe(409);
    expect(soldBooking.body.code).toBe("CAR_NOT_AVAILABLE");

    const draft = await publishedRental(owner.token, { publish: false });
    const draftBooking = await request(app)
      .post("/api/v1/bookings")
      .set(auth(renter.token))
      .send({ carId: draft.carId, startDate: "2026-10-10", endDate: "2026-10-12" });
    expect(draftBooking.status).toBe(409);
    expect(draftBooking.body.code).toBe("LISTING_NOT_ACTIVE");

    const limited = await publishedRental(owner.token, { availableUntil: "2026-10-03" });
    const outside = await request(app)
      .post("/api/v1/bookings")
      .set(auth(renter.token))
      .send({ carId: limited.carId, startDate: "2026-10-01", endDate: "2026-10-06" });
    expect(outside.status).toBe(409);
    expect(outside.body.code).toBe("OUTSIDE_AVAILABILITY");

    const { carId } = await publishedRental(owner.token);
    const past = await request(app)
      .post("/api/v1/bookings")
      .set(auth(renter.token))
      .send({ carId, startDate: "2020-01-01", endDate: "2020-01-03" });
    const impossible = await request(app)
      .post("/api/v1/bookings")
      .set(auth(renter.token))
      .send({ carId, startDate: "2026-02-31", endDate: "2026-03-02" });
    const reversed = await request(app)
      .post("/api/v1/bookings")
      .set(auth(renter.token))
      .send({ carId, startDate: "2026-10-12", endDate: "2026-10-10" });
    expect(past.status).toBe(422);
    expect(impossible.status).toBe(422);
    expect(reversed.status).toBe(422);

    const pending = await request(app)
      .post("/api/v1/bookings")
      .set(auth(renter.token))
      .send({ carId, startDate: "2026-12-01", endDate: "2026-12-04" });
    expect(pending.status).toBe(201);
    const bookingId = pending.body.data.booking.id as string;
    const rejected = await request(app).post(`/api/v1/bookings/${bookingId}/reject`).set(auth(owner.token));
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.booking.status).toBe("REJECTED");
    const renterReject = await request(app).post(`/api/v1/bookings/${bookingId}/reject`).set(auth(renter.token));
    expect(renterReject.status).toBe(403);

    const next = await request(app)
      .post("/api/v1/bookings")
      .set(auth(renter.token))
      .send({ carId, startDate: "2026-12-10", endDate: "2026-12-12" });
    const nextId = next.body.data.booking.id as string;
    await request(app).post(`/api/v1/bookings/${nextId}/confirm`).set(auth(owner.token));
    const rejectConfirmed = await request(app).post(`/api/v1/bookings/${nextId}/reject`).set(auth(owner.token));
    expect(rejectConfirmed.status).toBe(409);
    expect(rejectConfirmed.body.code).toBe("INVALID_STATUS_TRANSITION");
    const cancelled = await request(app).post(`/api/v1/bookings/${nextId}/cancel`).set(auth(owner.token));
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.booking.status).toBe("CANCELLED");
  });

  it("keeps the car rented until the last confirmed or active booking is finished", async () => {
    const owner = await account();
    const renter = await account();
    const { carId } = await publishedRental(owner.token, { dailyPrice: "10.00" });

    const active = await request(app)
      .post("/api/v1/bookings")
      .set(auth(renter.token))
      .send({ carId, startDate: "2026-10-01", endDate: "2026-10-03" });
    const later = await request(app)
      .post("/api/v1/bookings")
      .set(auth(renter.token))
      .send({ carId, startDate: "2026-10-03", endDate: "2026-10-05" });
    expect(active.status).toBe(201);
    expect(later.status).toBe(201);
    const activeId = active.body.data.booking.id as string;
    const laterId = later.body.data.booking.id as string;
    expect((await request(app).post(`/api/v1/bookings/${activeId}/confirm`).set(auth(owner.token))).status).toBe(200);
    expect((await request(app).post(`/api/v1/bookings/${laterId}/confirm`).set(auth(owner.token))).status).toBe(200);

    const tooSoon = await request(app).post(`/api/v1/bookings/${activeId}/complete`).set(auth(owner.token));
    expect(tooSoon.status).toBe(409);

    const payment = await request(app).post("/api/v1/payments").set(auth(renter.token)).send({ bookingId: activeId });
    expect(payment.status).toBe(201);
    const paid = await request(app)
      .post(`/api/v1/payments/${payment.body.data.payment.id as string}/pay`)
      .set(auth(renter.token));
    expect(paid.status).toBe(200);
    expect((await PrismaService.client().car.findUnique({ where: { id: carId } }))?.status).toBe("RENTED");
    expect((await PrismaService.client().listing.findFirst({ where: { carId, type: "RENT" } }))?.status).toBe("RENTED");

    const finished = await request(app).post(`/api/v1/bookings/${activeId}/complete`).set(auth(owner.token));
    expect(finished.status).toBe(200);
    expect(finished.body.data.booking.status).toBe("COMPLETED");
    expect((await PrismaService.client().car.findUnique({ where: { id: carId } }))?.status).toBe("RENTED");
    expect((await PrismaService.client().listing.findFirst({ where: { carId, type: "RENT" } }))?.status).toBe("RENTED");

    const released = await request(app).post(`/api/v1/bookings/${laterId}/cancel`).set(auth(owner.token));
    expect(released.status).toBe(200);
    expect((await PrismaService.client().car.findUnique({ where: { id: carId } }))?.status).toBe("AVAILABLE");
    expect((await PrismaService.client().listing.findFirst({ where: { carId, type: "RENT" } }))?.status).toBe(
      "PUBLISHED",
    );
  });
});
