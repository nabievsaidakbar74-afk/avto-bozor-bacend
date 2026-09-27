import { NotificationType, Prisma } from "@prisma/client";
import { AppError } from "../../common/errors/app-error.js";
import { assertCanChangeUserStatus } from "../../common/security/role-hierarchy.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import { AuditAction, auditService } from "../audit/audit.service.js";
import { safeUserSelect, type SafeUser } from "../auth/auth.dto.js";
import { writeNotifications } from "../notifications/notifications.service.js";
import {
  dashboardSummary,
  rentalSeries,
  revenueSeries,
  salesSeries,
  userSeries,
  type AnalyticsPeriod,
} from "./admin-analytics.js";
import type {
  AdminBooking,
  AdminCar,
  AdminListing,
  ListBookingsQuery,
  ListCarsQuery,
  ListListingsQuery,
  ListUsersQuery,
  Page,
  UpdateUserStatusInput,
  UserList,
} from "./admin.dto.js";

const USER_NOT_FOUND = new AppError("User not found", 404, "NOT_FOUND");
const RECENT_LIMIT = 5;

type RequestMeta = {
  ip?: string | null;
  userAgent?: string | null;
};

function pageOf(page: number, limit: number, total: number): Page {
  return {
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}

const personSelect = { id: true, firstName: true, lastName: true } as const;

function userOrderBy(
  sortBy: ListUsersQuery["sortBy"],
  sortOrder: ListUsersQuery["sortOrder"],
): Prisma.UserOrderByWithRelationInput {
  switch (sortBy) {
    case "email":
      return { email: sortOrder };
    case "firstName":
      return { firstName: sortOrder };
    case "lastName":
      return { lastName: sortOrder };
    case "role":
      return { role: sortOrder };
    case "status":
      return { status: sortOrder };
    case "updatedAt":
      return { updatedAt: sortOrder };
    case "createdAt":
      return { createdAt: sortOrder };
  }
}

function listWhere(query: ListUsersQuery): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {};
  if (query.role) {
    where.role = query.role;
  }
  if (query.status) {
    where.status = query.status;
  }
  if (query.search) {
    where.OR = [
      { email: { contains: query.search, mode: "insensitive" } },
      { phone: { contains: query.search, mode: "insensitive" } },
      { firstName: { contains: query.search, mode: "insensitive" } },
      { lastName: { contains: query.search, mode: "insensitive" } },
    ];
  }
  return where;
}

async function findUser(id: string): Promise<SafeUser> {
  const user = await PrismaService.client().user.findUnique({
    where: { id },
    select: safeUserSelect,
  });
  if (!user) {
    throw USER_NOT_FOUND;
  }
  return user;
}

export const adminService = {
  async listUsers(query: ListUsersQuery): Promise<UserList> {
    const where = listWhere(query);
    const [total, users] = await PrismaService.client().$transaction([
      PrismaService.client().user.count({ where }),
      PrismaService.client().user.findMany({
        where,
        select: safeUserSelect,
        orderBy: userOrderBy(query.sortBy, query.sortOrder),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);

    return {
      users,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
      },
    };
  },

  async getUser(id: string): Promise<SafeUser> {
    return findUser(id);
  },

  async updateUserStatus(
    actor: Pick<SafeUser, "id" | "role">,
    targetId: string,
    input: UpdateUserStatusInput,
    meta: RequestMeta = {},
  ): Promise<SafeUser> {
    const target = await findUser(targetId);
    assertCanChangeUserStatus(actor, target);
    if (target.status === input.status) {
      return target;
    }

    const user = await PrismaService.client().$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: target.id },
        data: { status: input.status },
        select: safeUserSelect,
      });
      await writeNotifications(tx, [
        {
          userId: updated.id,
          type: NotificationType.SYSTEM,
          title: "Account status updated",
          message: `Your account status is now ${updated.status}.`,
        },
      ]);
      await auditService.write(tx, {
        actorId: actor.id,
        action: input.status === "BLOCKED" ? AuditAction.USER_BLOCKED : AuditAction.ADMIN_ACTION,
        resource: "user",
        resourceId: updated.id,
        metadata: { from: target.status, to: updated.status },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return updated;
    });

    return user;
  },

  async dashboard() {
    const [summary, recentUsers, recentListings, recentSales, recentBookings] = await Promise.all([
      dashboardSummary(),
      PrismaService.client().user.findMany({
        select: safeUserSelect,
        orderBy: { createdAt: "desc" },
        take: RECENT_LIMIT,
      }),
      PrismaService.client().listing.findMany({
        select: {
          id: true,
          title: true,
          type: true,
          status: true,
          createdAt: true,
          owner: { select: personSelect },
          car: { select: { id: true, brand: true, model: true } },
        },
        orderBy: { createdAt: "desc" },
        take: RECENT_LIMIT,
      }),
      PrismaService.client().purchase.findMany({
        select: {
          id: true,
          price: true,
          status: true,
          createdAt: true,
          car: { select: { id: true, brand: true, model: true } },
          buyer: { select: personSelect },
          seller: { select: personSelect },
        },
        orderBy: { createdAt: "desc" },
        take: RECENT_LIMIT,
      }),
      PrismaService.client().rentalBooking.findMany({
        select: {
          id: true,
          status: true,
          startDate: true,
          endDate: true,
          totalPrice: true,
          createdAt: true,
          car: { select: { id: true, brand: true, model: true } },
          renter: { select: personSelect },
          owner: { select: personSelect },
        },
        orderBy: { createdAt: "desc" },
        take: RECENT_LIMIT,
      }),
    ]);

    return {
      ...summary,
      recentUsers,
      recentListings,
      recentSales: recentSales.map((sale) => ({
        ...sale,
        price: sale.price.toFixed(2),
      })),
      recentBookings: recentBookings.map((booking) => ({
        id: booking.id,
        status: booking.status,
        startDate: booking.startDate.toISOString().slice(0, 10),
        endDate: booking.endDate.toISOString().slice(0, 10),
        totalPrice: booking.totalPrice.toFixed(2),
        createdAt: booking.createdAt,
        car: booking.car,
        renter: booking.renter,
        owner: booking.owner,
      })),
    };
  },

  salesAnalytics(period: AnalyticsPeriod) {
    return salesSeries(period);
  },

  rentalAnalytics(period: AnalyticsPeriod) {
    return rentalSeries(period);
  },

  userAnalytics(period: AnalyticsPeriod) {
    return userSeries(period);
  },

  revenueAnalytics(period: AnalyticsPeriod) {
    return revenueSeries(period);
  },

  async listCars(query: ListCarsQuery): Promise<{ cars: AdminCar[]; pagination: Page }> {
    const where: Prisma.CarWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.brand ? { brand: { contains: query.brand, mode: "insensitive" } } : {}),
      ...(query.location ? { location: { contains: query.location, mode: "insensitive" } } : {}),
      ...(query.search
        ? {
            OR: [
              { brand: { contains: query.search, mode: "insensitive" } },
              { model: { contains: query.search, mode: "insensitive" } },
              { location: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [total, cars] = await PrismaService.client().$transaction([
      PrismaService.client().car.count({ where }),
      PrismaService.client().car.findMany({
        where,
        select: {
          id: true,
          brand: true,
          model: true,
          year: true,
          price: true,
          location: true,
          status: true,
          createdAt: true,
          owner: { select: personSelect },
        },
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return {
      cars: cars.map((car) => ({ ...car, price: car.price.toFixed(2) })),
      pagination: pageOf(query.page, query.limit, total),
    };
  },

  async listListings(query: ListListingsQuery): Promise<{ listings: AdminListing[]; pagination: Page }> {
    const where: Prisma.ListingWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.owner ? { ownerId: query.owner } : {}),
    };
    const [total, listings] = await PrismaService.client().$transaction([
      PrismaService.client().listing.count({ where }),
      PrismaService.client().listing.findMany({
        where,
        select: {
          id: true,
          title: true,
          type: true,
          status: true,
          createdAt: true,
          owner: { select: personSelect },
          car: { select: { id: true, brand: true, model: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return { listings, pagination: pageOf(query.page, query.limit, total) };
  },

  async listBookings(query: ListBookingsQuery): Promise<{ bookings: AdminBooking[]; pagination: Page }> {
    const where: Prisma.RentalBookingWhereInput = query.status ? { status: query.status } : {};
    const [total, bookings] = await PrismaService.client().$transaction([
      PrismaService.client().rentalBooking.count({ where }),
      PrismaService.client().rentalBooking.findMany({
        where,
        select: {
          id: true,
          status: true,
          startDate: true,
          endDate: true,
          totalPrice: true,
          createdAt: true,
          car: { select: { id: true, brand: true, model: true } },
          renter: { select: personSelect },
          owner: { select: personSelect },
        },
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return {
      bookings: bookings.map((booking) => ({
        id: booking.id,
        status: booking.status,
        startDate: booking.startDate.toISOString().slice(0, 10),
        endDate: booking.endDate.toISOString().slice(0, 10),
        totalPrice: booking.totalPrice.toFixed(2),
        createdAt: booking.createdAt,
        car: booking.car,
        renter: booking.renter,
        owner: booking.owner,
      })),
      pagination: pageOf(query.page, query.limit, total),
    };
  },
};
