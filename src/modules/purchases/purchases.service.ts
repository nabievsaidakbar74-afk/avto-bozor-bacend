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
import { assertListingTransition } from "../listings/listing-status.js";
import { writeNotifications } from "../notifications/notifications.service.js";
import { paymentsService } from "../payments/payments.service.js";
import { assertPurchaseTransition } from "./purchase-status.js";
import type { PurchaseList, PurchaseListQuery, PurchaseView } from "./purchases.dto.js";

const CAR_NOT_FOUND = new AppError("Car not found", 404, "NOT_FOUND");
const PURCHASE_NOT_FOUND = new AppError("Purchase not found", 404, "NOT_FOUND");
const CAR_NOT_AVAILABLE = new AppError("This car is not available for purchase", 409, "CAR_NOT_AVAILABLE");
const LISTING_NOT_ACTIVE = new AppError("This car does not have an active sale listing", 409, "LISTING_NOT_ACTIVE");
const BUYER_IS_OWNER = new AppError("You cannot purchase your own car", 409, "BUYER_IS_OWNER");
const PURCHASE_EXISTS = new AppError("This car already has a purchase", 409, "PURCHASE_EXISTS");
const FORBIDDEN_TRANSITION = new AppError("You cannot change this purchase", 403, "FORBIDDEN");

const purchaseSelect = {
  id: true,
  carId: true,
  buyerId: true,
  sellerId: true,
  price: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  car: {
    select: {
      id: true,
      brand: true,
      model: true,
      year: true,
      location: true,
    },
  },
  buyer: {
    select: { id: true, firstName: true, lastName: true },
  },
  seller: {
    select: { id: true, firstName: true, lastName: true },
  },
  payments: {
    select: {
      id: true,
      amount: true,
      currency: true,
      status: true,
      provider: true,
    },
    orderBy: { createdAt: "desc" as const },
    take: 1,
  },
} satisfies Prisma.PurchaseSelect;

type PurchaseRecord = Prisma.PurchaseGetPayload<{ select: typeof purchaseSelect }>;

type Actor = {
  id: string;
  role: RoleName;
};

function money(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

function toView(purchase: PurchaseRecord): PurchaseView {
  const payment = purchase.payments[0];
  return {
    id: purchase.id,
    carId: purchase.carId,
    buyerId: purchase.buyerId,
    sellerId: purchase.sellerId,
    price: money(purchase.price),
    status: purchase.status,
    createdAt: purchase.createdAt,
    updatedAt: purchase.updatedAt,
    car: purchase.car,
    buyer: purchase.buyer,
    seller: purchase.seller,
    payment: payment
      ? {
          id: payment.id,
          amount: money(payment.amount),
          currency: payment.currency.trim(),
          status: payment.status,
          provider: payment.provider,
        }
      : null,
  };
}

function pagination(page: number, limit: number, total: number): PurchaseList["pagination"] {
  return {
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}

function orderBy(query: PurchaseListQuery): Prisma.PurchaseOrderByWithRelationInput {
  if (query.sortBy === "price") {
    return { price: query.sortOrder };
  }
  return { createdAt: query.sortOrder };
}

function isStaff(role: RoleName): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

async function lockCar(tx: Prisma.TransactionClient, carId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM cars WHERE id = ${carId}::uuid FOR UPDATE`;
}

function listingStillOpen(expiresAt: Date | null): boolean {
  return expiresAt === null || expiresAt.getTime() > Date.now();
}

async function releaseInventory(tx: Prisma.TransactionClient, carId: string): Promise<void> {
  const listing = await tx.listing.findFirst({
    where: {
      carId,
      type: ListingType.SALE,
      status: { in: [ListingStatus.PUBLISHED, ListingStatus.SOLD] },
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, status: true, expiresAt: true },
  });
  await tx.car.update({
    where: { id: carId },
    data: { status: CarStatus.AVAILABLE },
  });
  if (!listing || !listingStillOpen(listing.expiresAt) || listing.status === ListingStatus.PUBLISHED) {
    return;
  }
  assertListingTransition(listing.status, ListingStatus.PUBLISHED, "transaction");
  await tx.listing.update({
    where: { id: listing.id },
    data: { status: ListingStatus.PUBLISHED },
  });
}

async function markSaleSold(tx: Prisma.TransactionClient, carId: string): Promise<void> {
  const listing = await tx.listing.findFirst({
    where: { carId, type: ListingType.SALE, status: ListingStatus.PUBLISHED },
    orderBy: { publishedAt: "desc" },
    select: { id: true, status: true },
  });
  await tx.car.update({
    where: { id: carId },
    data: { status: CarStatus.SOLD },
  });
  if (!listing) {
    return;
  }
  await tx.$queryRaw`SELECT id FROM listings WHERE id = ${listing.id}::uuid FOR UPDATE`;
  assertListingTransition(listing.status, ListingStatus.SOLD, "transaction");
  await tx.listing.update({
    where: { id: listing.id },
    data: { status: ListingStatus.SOLD },
  });
}

async function applyStatus(
  tx: Prisma.TransactionClient,
  purchase: { id: string; carId: string; buyerId: string; sellerId: string; status: PurchaseStatus; price: Prisma.Decimal },
  to: PurchaseStatus,
  actorId: string,
): Promise<void> {
  assertPurchaseTransition(purchase.status, to);
  await lockCar(tx, purchase.carId);

  if (to === PurchaseStatus.COMPLETED) {
    await tx.purchase.update({
      where: { id: purchase.id },
      data: { status: to, completedCarId: purchase.carId },
    });
    await markSaleSold(tx, purchase.carId);
    await notifyPurchase(tx, purchase, to);
    return;
  }

  if (to === PurchaseStatus.PAID) {
    await paymentsService.captureOpen(tx, { purchaseId: purchase.id }, purchase.price);
    await recordPaymentUpdate(tx, actorId, purchase.id, PurchaseStatus.PAID);
  }

  if (to === PurchaseStatus.REFUNDED) {
    await paymentsService.refundPaid(tx, { purchaseId: purchase.id });
    await recordPaymentUpdate(tx, actorId, purchase.id, PurchaseStatus.REFUNDED);
  }

  if (to === PurchaseStatus.CANCELLED) {
    await paymentsService.cancelOpen(tx, { purchaseId: purchase.id });
    await recordPaymentUpdate(tx, actorId, purchase.id, PurchaseStatus.CANCELLED);
  }

  await tx.purchase.update({
    where: { id: purchase.id },
    data: {
      status: to,
      completedCarId: null,
    },
  });

  if (to === PurchaseStatus.CANCELLED || to === PurchaseStatus.REFUNDED) {
    await releaseInventory(tx, purchase.carId);
  }
  await notifyPurchase(tx, purchase, to);
}

async function recordPaymentUpdate(
  tx: Prisma.TransactionClient,
  actorId: string,
  purchaseId: string,
  status: string,
): Promise<void> {
  const payment = await tx.payment.findFirst({
    where: { purchaseId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!payment) {
    return;
  }
  await auditService.write(tx, {
    actorId,
    action: AuditAction.PAYMENT_UPDATED,
    resource: "payment",
    resourceId: payment.id,
    metadata: { status },
  });
}

function notifyPurchase(
  tx: Prisma.TransactionClient,
  purchase: { buyerId: string; sellerId: string },
  to: PurchaseStatus,
): Promise<void> {
  const label = to.toLowerCase();
  return writeNotifications(tx, [
    {
      userId: purchase.buyerId,
      type: NotificationType.PURCHASE,
      title: "Purchase updated",
      message: `Your purchase is now ${label}.`,
    },
    {
      userId: purchase.sellerId,
      type: NotificationType.SALE,
      title: "Sale updated",
      message: `A sale is now ${label}.`,
    },
  ]);
}

export const purchasesService = {
  async create(actorId: string, carId: string): Promise<PurchaseView> {
    const buyerId = resolvePartyId(actorId);

    const purchaseId = await PrismaService.client().$transaction(async (tx) => {
      await lockCar(tx, carId);
      const car = await tx.car.findUnique({
        where: { id: carId },
        select: { id: true, ownerId: true, status: true },
      });
      if (!car) {
        throw CAR_NOT_FOUND;
      }
      if (car.status !== CarStatus.AVAILABLE) {
        throw CAR_NOT_AVAILABLE;
      }
      if (car.ownerId === buyerId) {
        throw BUYER_IS_OWNER;
      }
      const blockingBooking = await tx.rentalBooking.findFirst({
        where: {
          carId: car.id,
          status: { in: [RentalBookingStatus.CONFIRMED, RentalBookingStatus.ACTIVE] },
        },
        select: { id: true },
      });
      if (blockingBooking) {
        throw CAR_NOT_AVAILABLE;
      }

      const listing = await tx.listing.findFirst({
        where: {
          carId: car.id,
          ownerId: car.ownerId,
          type: ListingType.SALE,
          status: ListingStatus.PUBLISHED,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        orderBy: { publishedAt: "desc" },
        select: { id: true, status: true, salePrice: true, ownerId: true },
      });
      if (!listing?.salePrice) {
        throw LISTING_NOT_ACTIVE;
      }
      await tx.$queryRaw`SELECT id FROM listings WHERE id = ${listing.id}::uuid FOR UPDATE`;

      const openPurchase = await tx.purchase.findFirst({
        where: {
          carId: car.id,
          status: {
            in: [
              PurchaseStatus.PENDING,
              PurchaseStatus.CONFIRMED,
              PurchaseStatus.PAID,
              PurchaseStatus.COMPLETED,
            ],
          },
        },
        select: { id: true },
      });
      if (openPurchase) {
        throw PURCHASE_EXISTS;
      }

      const purchase = await tx.purchase.create({
        data: {
          buyerId,
          sellerId: car.ownerId,
          carId: car.id,
          price: listing.salePrice,
          status: PurchaseStatus.PENDING,
        },
        select: { id: true, price: true },
      });
      await paymentsService.createForPurchase(tx, {
        userId: buyerId,
        purchaseId: purchase.id,
        amount: purchase.price,
      });
      await tx.car.update({
        where: { id: car.id },
        data: { status: CarStatus.RESERVED },
      });
      await writeNotifications(tx, [
        {
          userId: buyerId,
          type: NotificationType.PURCHASE,
          title: "Purchase requested",
          message: "Your purchase request was submitted.",
        },
        {
          userId: car.ownerId,
          type: NotificationType.SALE,
          title: "New sale",
          message: "A buyer requested to purchase your car.",
        },
      ]);
      await auditService.write(tx, {
        actorId: buyerId,
        action: AuditAction.PURCHASE_CREATED,
        resource: "purchase",
        resourceId: purchase.id,
      });
      return purchase.id;
    });

    const created = await PrismaService.client().purchase.findUnique({
      where: { id: purchaseId },
      select: purchaseSelect,
    });
    if (!created) {
      throw PURCHASE_NOT_FOUND;
    }
    return toView(created);
  },

  async getForParticipant(actor: Actor, id: string): Promise<PurchaseView> {
    const purchase = await PrismaService.client().purchase.findUnique({
      where: { id },
      select: purchaseSelect,
    });
    if (!purchase || (purchase.buyerId !== actor.id && purchase.sellerId !== actor.id)) {
      throw PURCHASE_NOT_FOUND;
    }
    return toView(purchase);
  },

  async listForUser(actorId: string, role: "buyer" | "seller", query: PurchaseListQuery): Promise<PurchaseList> {
    const userId = resolvePartyId(actorId);
    const where: Prisma.PurchaseWhereInput = {
      ...(role === "buyer" ? { buyerId: userId } : { sellerId: userId }),
      ...(query.status ? { status: query.status } : {}),
    };
    const [total, purchases] = await PrismaService.client().$transaction([
      PrismaService.client().purchase.count({ where }),
      PrismaService.client().purchase.findMany({
        where,
        select: purchaseSelect,
        orderBy: orderBy(query),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return { purchases: purchases.map(toView), pagination: pagination(query.page, query.limit, total) };
  },

  async listForAdmin(query: PurchaseListQuery): Promise<PurchaseList> {
    const where: Prisma.PurchaseWhereInput = query.status ? { status: query.status } : {};
    const [total, purchases] = await PrismaService.client().$transaction([
      PrismaService.client().purchase.count({ where }),
      PrismaService.client().purchase.findMany({
        where,
        select: purchaseSelect,
        orderBy: orderBy(query),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return { purchases: purchases.map(toView), pagination: pagination(query.page, query.limit, total) };
  },

  async getForAdmin(id: string): Promise<PurchaseView> {
    const purchase = await PrismaService.client().purchase.findUnique({
      where: { id },
      select: purchaseSelect,
    });
    if (!purchase) {
      throw PURCHASE_NOT_FOUND;
    }
    return toView(purchase);
  },

  async changeStatus(
    actor: Actor,
    id: string,
    to: PurchaseStatus,
    meta: { ip?: string | null; userAgent?: string | null } = {},
  ): Promise<PurchaseView> {
    await PrismaService.client().$transaction(async (tx) => {
      const purchase = await tx.purchase.findUnique({
        where: { id },
        select: { id: true, carId: true, buyerId: true, sellerId: true, status: true, price: true },
      });
      if (!purchase) {
        throw PURCHASE_NOT_FOUND;
      }
      const staff = isStaff(actor.role);
      if (!staff && actor.id !== purchase.buyerId && actor.id !== purchase.sellerId) {
        throw PURCHASE_NOT_FOUND;
      }
      if (!staff) {
        const allowed =
          (to === PurchaseStatus.CONFIRMED && actor.id === purchase.sellerId) ||
          (to === PurchaseStatus.CANCELLED &&
            (actor.id === purchase.buyerId || actor.id === purchase.sellerId)) ||
          (to === PurchaseStatus.PAID && actor.id === purchase.buyerId) ||
          (to === PurchaseStatus.COMPLETED && actor.id === purchase.sellerId);
        if (!allowed) {
          throw FORBIDDEN_TRANSITION;
        }
      }
      const previous = purchase.status;
      await applyStatus(tx, purchase, to, actor.id);
      if (staff) {
        await auditService.write(tx, {
          actorId: actor.id,
          action: AuditAction.ADMIN_ACTION,
          resource: "purchase",
          resourceId: purchase.id,
          metadata: { from: previous, to },
          ip: meta.ip,
          userAgent: meta.userAgent,
        });
      }
    });

    return this.getForAdmin(id);
  },
};
