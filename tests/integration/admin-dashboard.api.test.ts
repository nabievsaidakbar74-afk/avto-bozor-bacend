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
  return `+99876${randomInt(1_000_000, 10_000_000).toString()}`;
}

function auth(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

type Dashboard = {
  totalUsers: number;
  activeUsers: number;
  blockedUsers: number;
  totalCars: number;
  publishedListings: number;
  pendingListings: number;
  soldCars: number;
  rentedCars: number;
  totalSales: number;
  completedSales: number;
  activeRentals: number;
  completedRentals: number;
  pendingBookings: number;
  totalRevenue: string;
  salesRevenue: string;
  rentalRevenue: string;
  recentUsers: { id: string }[];
  recentListings: { id: string }[];
  recentSales: { id: string; price: string }[];
  recentBookings: { id: string }[];
};

describe("admin dashboard", () => {
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
    await PrismaService.client().auditLog.deleteMany({
      where: { OR: [{ actorId: { in: userIds } }, { resourceId: { in: [...userIds, ...purchaseIds] } }] },
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

  async function account(role: UserRole = UserRole.USER): Promise<{ id: string; token: string; email: string }> {
    const email = `dash.${randomUUID()}@example.com`;
    const user = await PrismaService.client().user.create({
      data: {
        email,
        phone: uniquePhone(),
        passwordHash,
        firstName: "Dash",
        lastName: role,
        role,
        status: UserStatus.ACTIVE,
      },
      select: { id: true },
    });
    userIds.push(user.id);
    const login = await request(app).post("/api/v1/auth/login").send({ email, password });
    expect(login.status).toBe(200);
    return { id: user.id, token: login.body.data.accessToken as string, email };
  }

  async function carFor(token: string, location: string): Promise<string> {
    const created = await request(app)
      .post("/api/v1/cars")
      .set(auth(token))
      .send({
        brand: "Tracker",
        model: "Admin",
        year: 2023,
        price: "14000.00",
        mileage: 12000,
        fuelType: "PETROL",
        transmission: "AUTOMATIC",
        bodyType: "SUV",
        color: "Gray",
        engine: "1.8",
        description: "Admin catalog car",
        location,
        status: "AVAILABLE",
      });
    expect(created.status).toBe(201);
    return created.body.data.car.id as string;
  }

  async function dashboard(token: string): Promise<Dashboard> {
    const response = await request(app).get("/api/v1/admin/dashboard").set(auth(token));
    expect(response.status).toBe(200);
    return response.body.data.dashboard as Dashboard;
  }

  it("allows only administrators to read dashboard data", async () => {
    const admin = await account(UserRole.ADMIN);
    const superAdmin = await account(UserRole.SUPER_ADMIN);
    const moderator = await account(UserRole.MODERATOR);
    const user = await account();

    expect((await request(app).get("/api/v1/admin/dashboard")).status).toBe(401);
    expect((await request(app).get("/api/v1/admin/dashboard").set(auth(user.token))).status).toBe(403);
    expect((await request(app).get("/api/v1/admin/dashboard").set(auth(moderator.token))).status).toBe(403);
    expect((await request(app).get("/api/v1/admin/analytics/sales").set(auth(user.token))).status).toBe(403);
    expect((await request(app).get("/api/v1/admin/cars").set(auth(moderator.token))).status).toBe(403);
    expect((await request(app).get("/api/v1/admin/bookings").set(auth(user.token))).status).toBe(403);

    const adminView = await dashboard(admin.token);
    const superView = await request(app).get("/api/v1/admin/dashboard").set(auth(superAdmin.token));
    expect(superView.status).toBe(200);
    expect(adminView.totalUsers).toBeGreaterThan(0);
    expect(JSON.stringify(adminView)).not.toMatch(/passwordHash/);

    const pending = await request(app).get("/api/v1/admin/listings/pending").set(auth(moderator.token));
    const fullList = await request(app).get("/api/v1/admin/listings").set(auth(moderator.token));
    expect(pending.status).toBe(200);
    expect(fullList.status).toBe(403);
  });

  it("aggregates marketplace totals and filters admin lists", async () => {
    const admin = await account(UserRole.ADMIN);
    const seller = await account();
    const buyer = await account();
    const renter = await account();
    const before = await dashboard(admin.token);
    const location = `Dash ${randomUUID()}`;

    const saleCar = await carFor(seller.token, location);
    const saleListing = await request(app).post("/api/v1/listings").set(auth(seller.token)).send({
      carId: saleCar,
      type: "SALE",
      title: `Dash sale ${randomUUID()}`,
      description: "For the dashboard",
      salePrice: "1500.50",
    });
    expect(saleListing.status).toBe(201);
    const saleListingId = saleListing.body.data.listing.id as string;
    await PrismaService.client().listing.update({
      where: { id: saleListingId },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });

    const pendingCar = await carFor(seller.token, `${location} pending`);
    const pendingListing = await request(app).post("/api/v1/listings").set(auth(seller.token)).send({
      carId: pendingCar,
      type: "RENT",
      title: "Waiting",
      description: "Pending rental",
      rentalDailyPrice: "15.00",
      status: "PENDING_MODERATION",
    });
    expect(pendingListing.status).toBe(201);

    const rentedCar = await carFor(seller.token, `${location} rented`);
    await PrismaService.client().car.update({ where: { id: rentedCar }, data: { status: "RENTED" } });

    const purchase = await request(app).post("/api/v1/purchases").set(auth(buyer.token)).send({ carId: saleCar });
    expect(purchase.status).toBe(201);
    const purchaseId = purchase.body.data.purchase.id as string;
    expect((await request(app).post(`/api/v1/purchases/${purchaseId}/confirm`).set(auth(seller.token))).status).toBe(200);
    expect((await request(app).post(`/api/v1/purchases/${purchaseId}/pay`).set(auth(buyer.token))).status).toBe(200);
    expect((await request(app).post(`/api/v1/purchases/${purchaseId}/complete`).set(auth(seller.token))).status).toBe(200);

    const rentalCar = await carFor(seller.token, `${location} rental`);
    const rental = await request(app).post("/api/v1/rentals").set(auth(seller.token)).send({
      carId: rentalCar,
      description: "Dashboard rental",
      dailyPrice: "10.00",
    });
    await PrismaService.client().listing.update({
      where: { id: rental.body.data.listing.id as string },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    const pendingBooking = await request(app)
      .post("/api/v1/bookings")
      .set(auth(renter.token))
      .send({ carId: rentalCar, startDate: "2026-10-01", endDate: "2026-10-02" });
    const activeBooking = await request(app)
      .post("/api/v1/bookings")
      .set(auth(renter.token))
      .send({ carId: rentalCar, startDate: "2026-10-02", endDate: "2026-10-03" });
    const completedBooking = await request(app)
      .post("/api/v1/bookings")
      .set(auth(renter.token))
      .send({ carId: rentalCar, startDate: "2026-10-03", endDate: "2026-10-04" });
    expect(pendingBooking.status).toBe(201);
    expect(activeBooking.status).toBe(201);
    expect(completedBooking.status).toBe(201);
    await PrismaService.client().rentalBooking.update({
      where: { id: activeBooking.body.data.booking.id as string },
      data: { status: "ACTIVE" },
    });
    await PrismaService.client().rentalBooking.update({
      where: { id: completedBooking.body.data.booking.id as string },
      data: { status: "COMPLETED" },
    });

    const after = await dashboard(admin.token);
    expect(after.totalCars - before.totalCars).toBe(4);
    expect(after.publishedListings - before.publishedListings).toBe(1);
    expect(after.pendingListings - before.pendingListings).toBe(1);
    expect(after.soldCars - before.soldCars).toBe(1);
    expect(after.rentedCars - before.rentedCars).toBe(1);
    expect(after.totalSales - before.totalSales).toBe(1);
    expect(after.completedSales - before.completedSales).toBe(1);
    expect(after.pendingBookings - before.pendingBookings).toBe(1);
    expect(after.activeRentals - before.activeRentals).toBe(1);
    expect(after.completedRentals - before.completedRentals).toBe(1);
    expect(Number(after.salesRevenue) - Number(before.salesRevenue)).toBeCloseTo(1500.5, 2);
    expect(Number(after.rentalRevenue) - Number(before.rentalRevenue)).toBeCloseTo(10, 2);
    expect(Number(after.totalRevenue) - Number(before.totalRevenue)).toBeCloseTo(1510.5, 2);
    expect(after.recentSales.map((sale) => sale.id)).toContain(purchaseId);
    expect(after.recentSales.find((sale) => sale.id === purchaseId)?.price).toBe("1500.50");
    expect(after.recentBookings.map((booking) => booking.id)).toContain(pendingBooking.body.data.booking.id);
    expect(after.recentListings.map((listing) => listing.id)).toContain(saleListingId);

    const cars = await request(app)
      .get("/api/v1/admin/cars")
      .query({ search: "Tracker", brand: "track", status: "SOLD", location, page: 1, limit: 10 })
      .set(auth(admin.token));
    expect(cars.status).toBe(200);
    expect(cars.body.data.cars.map((car: { id: string }) => car.id)).toEqual([saleCar]);

    const listings = await request(app)
      .get("/api/v1/admin/listings")
      .query({ status: "SOLD", type: "SALE", owner: seller.id })
      .set(auth(admin.token));
    expect(listings.body.data.listings.map((listing: { id: string }) => listing.id)).toContain(saleListingId);

    const bookings = await request(app)
      .get("/api/v1/admin/bookings")
      .query({ status: "PENDING" })
      .set(auth(admin.token));
    expect(bookings.body.data.bookings.map((booking: { id: string }) => booking.id)).toContain(
      pendingBooking.body.data.booking.id,
    );

    const sales = await request(app).get("/api/v1/admin/sales").query({ status: "COMPLETED" }).set(auth(admin.token));
    const hiddenSales = await request(app).get("/api/v1/admin/sales").set(auth(buyer.token));
    expect(sales.status).toBe(200);
    expect(sales.body.data.purchases.map((item: { id: string }) => item.id)).toContain(purchaseId);
    expect(hiddenSales.status).toBe(403);

    const users = await request(app)
      .get("/api/v1/admin/users")
      .query({ search: seller.email, role: "USER", status: "ACTIVE", sortBy: "email", sortOrder: "asc" })
      .set(auth(admin.token));
    expect(users.status).toBe(200);
    expect(users.body.data.users.map((item: { id: string }) => item.id)).toContain(seller.id);
    expect(JSON.stringify(users.body)).not.toMatch(/passwordHash/);
  });

  it("builds period series in the database and audits admin mutations", async () => {
    const admin = await account(UserRole.ADMIN);
    const seller = await account();
    const buyer = await account();
    const target = await account();
    const beforeUsers = await request(app).get("/api/v1/admin/analytics/users?period=7d").set(auth(admin.token));
    const beforeSales = await request(app).get("/api/v1/admin/analytics/sales?period=7d").set(auth(admin.token));
    expect(beforeUsers.status).toBe(200);
    expect(beforeUsers.body.data.points).toHaveLength(7);

    const joined = await account();
    const carId = await carFor(seller.token, `Series ${randomUUID()}`);
    const listing = await request(app).post("/api/v1/listings").set(auth(seller.token)).send({
      carId,
      type: "SALE",
      title: "Series sale",
      description: "Analytics",
      salePrice: "200.00",
    });
    await PrismaService.client().listing.update({
      where: { id: listing.body.data.listing.id as string },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    const purchase = await request(app).post("/api/v1/purchases").set(auth(buyer.token)).send({ carId });
    const purchaseId = purchase.body.data.purchase.id as string;
    await request(app).post(`/api/v1/purchases/${purchaseId}/confirm`).set(auth(seller.token));
    await request(app).post(`/api/v1/purchases/${purchaseId}/pay`).set(auth(buyer.token));
    await request(app).post(`/api/v1/purchases/${purchaseId}/complete`).set(auth(seller.token));

    const invalid = await request(app).get("/api/v1/admin/analytics/sales?period=2d").set(auth(admin.token));
    expect(invalid.status).toBe(422);

    const month = await request(app).get("/api/v1/admin/analytics/sales?period=30d").set(auth(admin.token));
    const quarter = await request(app).get("/api/v1/admin/analytics/rentals?period=90d").set(auth(admin.token));
    const year = await request(app).get("/api/v1/admin/analytics/revenue?period=1y").set(auth(admin.token));
    expect(month.body.data.points).toHaveLength(30);
    expect(quarter.body.data.points).toHaveLength(90);
    expect(quarter.body.data.points[0]).toEqual(
      expect.objectContaining({
        date: expect.any(String),
        count: expect.any(Number),
        revenue: expect.any(String),
      }),
    );
    expect(year.body.data.points).toHaveLength(12);

    const sales = await request(app).get("/api/v1/admin/analytics/sales?period=7d").set(auth(admin.token));
    const users = await request(app).get("/api/v1/admin/analytics/users?period=7d").set(auth(admin.token));
    const revenue = await request(app).get("/api/v1/admin/analytics/revenue?period=7d").set(auth(admin.token));
    const date = todayUtc();
    const salesBefore = beforeSales.body.data.points.find((point: { date: string }) => point.date === date) as {
      count: number;
      revenue: string;
    };
    const salesAfter = sales.body.data.points.find((point: { date: string }) => point.date === date) as {
      count: number;
      revenue: string;
    };
    const usersBefore = beforeUsers.body.data.points.find((point: { date: string }) => point.date === date) as {
      count: number;
    };
    const usersAfter = users.body.data.points.find((point: { date: string }) => point.date === date) as {
      count: number;
    };
    const revenueAfter = revenue.body.data.points.find((point: { date: string }) => point.date === date) as {
      salesRevenue: string;
      totalRevenue: string;
    };
    expect(salesAfter.count - salesBefore.count).toBe(1);
    expect(Number(salesAfter.revenue) - Number(salesBefore.revenue)).toBeCloseTo(200, 2);
    expect(usersAfter.count - usersBefore.count).toBe(1);
    expect(users.body.data.points.some((point: { date: string }) => point.date === date)).toBe(true);
    expect(Number(revenueAfter.salesRevenue)).toBeGreaterThanOrEqual(200);
    expect(Number(revenueAfter.totalRevenue)).toBeGreaterThanOrEqual(Number(revenueAfter.salesRevenue));
    expect(joined.id).toBeTruthy();

    const openCar = await carFor(seller.token, `Open ${randomUUID()}`);
    const openListing = await request(app).post("/api/v1/listings").set(auth(seller.token)).send({
      carId: openCar,
      type: "SALE",
      title: "Open sale",
      description: "Audit",
      salePrice: "90.00",
    });
    await PrismaService.client().listing.update({
      where: { id: openListing.body.data.listing.id as string },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    const openPurchase = await request(app).post("/api/v1/purchases").set(auth(buyer.token)).send({ carId: openCar });
    const openId = openPurchase.body.data.purchase.id as string;
    const confirmed = await request(app)
      .patch(`/api/v1/admin/sales/${openId}/status`)
      .set(auth(admin.token))
      .send({ status: "CONFIRMED" });
    expect(confirmed.status).toBe(200);
    const saleAudit = await PrismaService.client().auditLog.findFirst({
      where: { action: "ADMIN_ACTION", resource: "purchase", resourceId: openId, actorId: admin.id },
    });
    expect(saleAudit?.resource).toBe("purchase");

    const blocked = await request(app)
      .patch(`/api/v1/admin/users/${target.id}/status`)
      .set(auth(admin.token))
      .send({ status: "BLOCKED" });
    expect(blocked.status).toBe(200);
    const userAudit = await PrismaService.client().auditLog.findFirst({
      where: { action: "USER_BLOCKED", resourceId: target.id, actorId: admin.id },
    });
    expect(userAudit?.resource).toBe("user");
    const denied = await request(app).get("/api/v1/admin/users").set(auth(target.token));
    expect(denied.status).toBe(403);
  });
});
