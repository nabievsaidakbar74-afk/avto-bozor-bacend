import {
  CarStatus,
  ListingStatus,
  ListingType,
  NotificationType,
  Prisma,
  PurchaseStatus,
  RentalBookingStatus,
} from "@prisma/client";
import { AppError } from "../../common/errors/app-error.js";
import { resolvePartyId } from "../../common/security/ownership.js";
import type { RoleName } from "../../common/security/roles.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import { AuditAction, auditService } from "../audit/audit.service.js";
import { paymentsService } from "../payments/payments.service.js";
import { writeNotifications } from "../notifications/notifications.service.js";
import { isBeforeToday, numberOfDays, parseBookingDate } from "./booking-dates.js";
import { assertBookingTransition } from "./booking-status.js";
import { releaseRentalIfIdle } from "./rental-inventory.js";
import type { BookingList, BookingListQuery, BookingView } from "./bookings.dto.js";

const NOT_FOUND = new AppError("Booking not found", 404, "NOT_FOUND");
const CAR_NOT_FOUND = new AppError("Car not found", 404, "NOT_FOUND");
const CAR_NOT_AVAILABLE = new AppError("This car is not available for rental", 409, "CAR_NOT_AVAILABLE");
const LISTING_NOT_ACTIVE = new AppError("This car does not have an active rental listing", 409, "LISTING_NOT_ACTIVE");
const OUTSIDE_AVAILABILITY = new AppError("These dates are outside the rental availability", 409, "OUTSIDE_AVAILABILITY");
const RENTER_IS_OWNER = new AppError("You cannot rent your own car", 409, "RENTER_IS_OWNER");
const BOOKING_OVERLAP = new AppError("These dates overlap an existing rental", 409, "BOOKING_OVERLAP");
const INVALID_DATES = new AppError("Enter a future rental period", 422, "INVALID_BOOKING_DATES");
const FORBIDDEN = new AppError("You cannot change this booking", 403, "FORBIDDEN");

const BLOCKING_STATUSES = [RentalBookingStatus.CONFIRMED, RentalBookingStatus.ACTIVE] as const;

const bookingSelect = {
  id: true,
  carId: true,
  renterId: true,
  ownerId: true,
  startDate: true,
  endDate: true,
  dailyPrice: true,
  totalPrice: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  car: {
    select: { id: true, brand: true, model: true, location: true },
  },
  renter: {
    select: { id: true, firstName: true, lastName: true },
  },
  owner: {
    select: { id: true, firstName: true, lastName: true },
  },
} satisfies Prisma.RentalBookingSelect;

type BookingRecord = Prisma.RentalBookingGetPayload<{ select: typeof bookingSelect }>;

type Actor = {
  id: string;
  role: RoleName;
};

function money(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toView(booking: BookingRecord): BookingView {
  return {
    id: booking.id,
    carId: booking.carId,
    renterId: booking.renterId,
    ownerId: booking.ownerId,
    startDate: dateOnly(booking.startDate),
    endDate: dateOnly(booking.endDate),
    numberOfDays: numberOfDays(booking.startDate, booking.endDate),
    dailyPrice: money(booking.dailyPrice),
    totalPrice: money(booking.totalPrice),
    status: booking.status,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
    car: booking.car,
    renter: booking.renter,
    owner: booking.owner,
  };
}

function pagination(page: number, limit: number, total: number): BookingList["pagination"] {
  return {
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}

async function lockCar(tx: Prisma.TransactionClient, carId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM cars WHERE id = ${carId}::uuid FOR UPDATE`;
}

async function hasOverlap(
  tx: Prisma.TransactionClient,
  carId: string,
  startDate: Date,
  endDate: Date,
  exceptId?: string,
): Promise<boolean> {
  const existing = await tx.rentalBooking.findFirst({
    where: {
      carId,
      status: { in: [...BLOCKING_STATUSES] },
      startDate: { lt: endDate },
      endDate: { gt: startDate },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  return existing !== null;
}

const OPEN_PURCHASE_STATUSES = [
  PurchaseStatus.PENDING,
  PurchaseStatus.CONFIRMED,
  PurchaseStatus.PAID,
  PurchaseStatus.COMPLETED,
] as const;

async function hasOpenPurchase(tx: Prisma.TransactionClient, carId: string): Promise<boolean> {
  const purchase = await tx.purchase.findFirst({
    where: { carId, status: { in: [...OPEN_PURCHASE_STATUSES] } },
    select: { id: true },
  });
  return purchase !== null;
}

function requirePeriod(startValue: string, endValue: string): { startDate: Date; endDate: Date; days: number } {
  const startDate = parseBookingDate(startValue);
  const endDate = parseBookingDate(endValue);
  if (!startDate || !endDate || startDate >= endDate) {
    throw INVALID_DATES;
  }
  if (isBeforeToday(startDate)) {
    throw INVALID_DATES;
  }
  const days = numberOfDays(startDate, endDate);
  if (days < 1) {
    throw INVALID_DATES;
  }
  return { startDate, endDate, days };
}

async function loadBooking(id: string): Promise<BookingRecord> {
  const booking = await PrismaService.client().rentalBooking.findUnique({
    where: { id },
    select: bookingSelect,
  });
  if (!booking) {
    throw NOT_FOUND;
  }
  return booking;
}

export const bookingsService = {
  async create(actorId: string, input: { carId: string; startDate: string; endDate: string }): Promise<BookingView> {
    const renterId = resolvePartyId(actorId);
    const period = requirePeriod(input.startDate, input.endDate);

    const bookingId = await PrismaService.client().$transaction(async (tx) => {
      await lockCar(tx, input.carId);
      const car = await tx.car.findUnique({
        where: { id: input.carId },
        select: { id: true, ownerId: true, status: true },
      });
      if (!car) {
        throw CAR_NOT_FOUND;
      }
      if (car.status !== CarStatus.AVAILABLE) {
        throw CAR_NOT_AVAILABLE;
      }
      if (car.ownerId === renterId) {
        throw RENTER_IS_OWNER;
      }
      if (await hasOpenPurchase(tx, car.id)) {
        throw CAR_NOT_AVAILABLE;
      }

      const listing = await tx.listing.findFirst({
        where: {
          carId: car.id,
          ownerId: car.ownerId,
          type: ListingType.RENT,
          status: ListingStatus.PUBLISHED,
        },
        orderBy: { publishedAt: "desc" },
        select: { rentalDailyPrice: true, expiresAt: true },
      });
      if (!listing?.rentalDailyPrice) {
        throw LISTING_NOT_ACTIVE;
      }
      if (listing.expiresAt && listing.expiresAt < period.endDate) {
        throw OUTSIDE_AVAILABILITY;
      }
      if (await hasOverlap(tx, car.id, period.startDate, period.endDate)) {
        throw BOOKING_OVERLAP;
      }

      const created = await tx.rentalBooking.create({
        data: {
          carId: car.id,
          renterId,
          ownerId: car.ownerId,
          startDate: period.startDate,
          endDate: period.endDate,
          dailyPrice: listing.rentalDailyPrice,
          totalPrice: listing.rentalDailyPrice.mul(period.days),
          status: RentalBookingStatus.PENDING,
        },
        select: { id: true },
      });
      await writeNotifications(tx, [
        {
          userId: renterId,
          type: NotificationType.BOOKING,
          title: "Booking requested",
          message: "Your rental request was submitted.",
        },
        {
          userId: car.ownerId,
          type: NotificationType.RENTAL,
          title: "New rental request",
          message: "A renter requested your car.",
        },
      ]);
      await auditService.write(tx, {
        actorId: renterId,
        action: AuditAction.BOOKING_CREATED,
        resource: "booking",
        resourceId: created.id,
      });
      return created.id;
    });

    return toView(await loadBooking(bookingId));
  },

  async listForUser(actorId: string, role: "renter" | "owner", query: BookingListQuery): Promise<BookingList> {
    const userId = resolvePartyId(actorId);
    const where: Prisma.RentalBookingWhereInput = role === "renter" ? { renterId: userId } : { ownerId: userId };
    const orderBy: Prisma.RentalBookingOrderByWithRelationInput =
      query.sortBy === "startDate" ? { startDate: query.sortOrder } : { createdAt: query.sortOrder };
    const [total, bookings] = await PrismaService.client().$transaction([
      PrismaService.client().rentalBooking.count({ where }),
      PrismaService.client().rentalBooking.findMany({
        where,
        select: bookingSelect,
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return {
      bookings: bookings.map(toView),
      pagination: pagination(query.page, query.limit, total),
    };
  },

  async confirm(actor: Actor, id: string): Promise<BookingView> {
    await PrismaService.client().$transaction(async (tx) => {
      const booking = await tx.rentalBooking.findUnique({
        where: { id },
        select: {
          id: true,
          carId: true,
          ownerId: true,
          renterId: true,
          status: true,
          startDate: true,
          endDate: true,
        },
      });
      assertParticipant(booking, actor.id, "owner");
      await lockCar(tx, booking.carId);
      const current = await tx.rentalBooking.findUnique({
        where: { id: booking.id },
        select: { status: true, startDate: true, endDate: true },
      });
      if (!current) {
        throw NOT_FOUND;
      }
      assertBookingTransition(current.status, RentalBookingStatus.CONFIRMED);
      if (await hasOpenPurchase(tx, booking.carId)) {
        throw CAR_NOT_AVAILABLE;
      }
      if (await hasOverlap(tx, booking.carId, current.startDate, current.endDate, booking.id)) {
        throw BOOKING_OVERLAP;
      }
      await tx.rentalBooking.update({
        where: { id: booking.id },
        data: { status: RentalBookingStatus.CONFIRMED },
      });
      await notifyBooking(tx, booking, RentalBookingStatus.CONFIRMED);
      await auditService.write(tx, {
        actorId: actor.id,
        action: AuditAction.BOOKING_CONFIRMED,
        resource: "booking",
        resourceId: booking.id,
      });
    });
    return toView(await loadBooking(id));
  },

  async reject(actor: Actor, id: string): Promise<BookingView> {
    await this.changeStatus(actor, id, RentalBookingStatus.REJECTED, "owner");
    return toView(await loadBooking(id));
  },

  async cancel(actor: Actor, id: string): Promise<BookingView> {
    await this.changeStatus(actor, id, RentalBookingStatus.CANCELLED, "either");
    return toView(await loadBooking(id));
  },

  async complete(actor: Actor, id: string): Promise<BookingView> {
    await PrismaService.client().$transaction(async (tx) => {
      const booking = await tx.rentalBooking.findUnique({
        where: { id },
        select: { id: true, carId: true, ownerId: true, renterId: true, status: true },
      });
      assertParticipant(booking, actor.id, "owner");
      await lockCar(tx, booking.carId);
      const current = await tx.rentalBooking.findUnique({
        where: { id: booking.id },
        select: { status: true },
      });
      if (!current) {
        throw NOT_FOUND;
      }
      assertBookingTransition(current.status, RentalBookingStatus.COMPLETED);
      await tx.rentalBooking.update({
        where: { id: booking.id },
        data: { status: RentalBookingStatus.COMPLETED },
      });
      await releaseRentalIfIdle(tx, booking.carId);
      await notifyBooking(tx, booking, RentalBookingStatus.COMPLETED);
    });
    return toView(await loadBooking(id));
  },

  async changeStatus(
    actor: Actor,
    id: string,
    to: RentalBookingStatus,
    who: "owner" | "either",
  ): Promise<void> {
    await PrismaService.client().$transaction(async (tx) => {
      const booking = await tx.rentalBooking.findUnique({
        where: { id },
        select: { id: true, carId: true, ownerId: true, renterId: true, status: true },
      });
      assertParticipant(booking, actor.id, who);
      await lockCar(tx, booking.carId);
      const current = await tx.rentalBooking.findUnique({
        where: { id: booking.id },
        select: { status: true },
      });
      if (!current) {
        throw NOT_FOUND;
      }
      assertBookingTransition(current.status, to);
      await tx.rentalBooking.update({
        where: { id: booking.id },
        data: { status: to },
      });
      if (to === RentalBookingStatus.CANCELLED || to === RentalBookingStatus.REJECTED) {
        await paymentsService.cancelOpen(tx, { bookingId: booking.id });
      }
      if (to === RentalBookingStatus.CANCELLED) {
        await releaseRentalIfIdle(tx, booking.carId);
        await auditService.write(tx, {
          actorId: actor.id,
          action: AuditAction.BOOKING_CANCELLED,
          resource: "booking",
          resourceId: booking.id,
        });
      }
      await notifyBooking(tx, booking, to);
    });
  },
};

function assertParticipant<T extends { ownerId: string; renterId: string }>(
  booking: T | null,
  actorId: string,
  who: "owner" | "either",
): asserts booking is T {
  if (!booking || (booking.ownerId !== actorId && booking.renterId !== actorId)) {
    throw NOT_FOUND;
  }
  if (who === "owner" && booking.ownerId !== actorId) {
    throw FORBIDDEN;
  }
}

function notifyBooking(
  tx: Prisma.TransactionClient,
  booking: { renterId: string; ownerId: string },
  status: RentalBookingStatus,
): Promise<void> {
  const label = status.toLowerCase();
  return writeNotifications(tx, [
    {
      userId: booking.renterId,
      type: NotificationType.BOOKING,
      title: "Booking updated",
      message: `Your booking is now ${label}.`,
    },
    {
      userId: booking.ownerId,
      type: NotificationType.RENTAL,
      title: "Rental updated",
      message: `A rental booking is now ${label}.`,
    },
  ]);
}
