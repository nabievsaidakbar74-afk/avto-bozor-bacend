import { PaymentStatus, Prisma, PurchaseStatus, RentalBookingStatus } from "@prisma/client";
import { AppError } from "../../common/errors/app-error.js";
import { resolvePartyId } from "../../common/security/ownership.js";
import type { RoleName } from "../../common/security/roles.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import { AuditAction, auditService } from "../audit/audit.service.js";
import { assertBookingTransition } from "../bookings/booking-status.js";
import { markRentalOccupied, releaseRentalIfIdle } from "../bookings/rental-inventory.js";
import { paymentProvider } from "./payment-provider.js";
import { assertPaymentTransition, OPEN_PAYMENT_STATUSES } from "./payment-status.js";
import type { PaymentList, PaymentListQuery, PaymentView } from "./payments.dto.js";

const NOT_FOUND = new AppError("Payment not found", 404, "NOT_FOUND");
const PURCHASE_NOT_FOUND = new AppError("Purchase not found", 404, "NOT_FOUND");
const BOOKING_NOT_FOUND = new AppError("Booking not found", 404, "NOT_FOUND");
const FORBIDDEN = new AppError("You cannot pay for this transaction", 403, "FORBIDDEN");
const NOT_READY = new AppError("This transaction cannot be paid yet", 409, "PAYMENT_NOT_READY");
const DUPLICATE = new AppError("This transaction already has a payment", 409, "DUPLICATE_PAYMENT");
const MISSING = new AppError("No open payment was found", 409, "PAYMENT_NOT_FOUND");
const AMOUNT_MISMATCH = new AppError("The payment amount does not match the transaction", 409, "PAYMENT_AMOUNT_MISMATCH");

const paymentSelect = {
  id: true,
  userId: true,
  purchaseId: true,
  bookingId: true,
  amount: true,
  currency: true,
  status: true,
  provider: true,
  providerTransactionId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PaymentSelect;

type PaymentRecord = Prisma.PaymentGetPayload<{ select: typeof paymentSelect }>;

type Actor = {
  id: string;
  role: RoleName;
};

type Subject = { purchaseId: string } | { bookingId: string };

function isStaff(role: RoleName): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

function money(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

function toView(payment: PaymentRecord): PaymentView {
  return {
    id: payment.id,
    userId: payment.userId,
    purchaseId: payment.purchaseId,
    bookingId: payment.bookingId,
    amount: money(payment.amount),
    currency: payment.currency.trim(),
    status: payment.status,
    provider: payment.provider,
    providerTransactionId: payment.providerTransactionId,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  };
}

function pageOf(page: number, limit: number, total: number): PaymentList["pagination"] {
  return {
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}

function subjectOf(payment: { purchaseId: string | null; bookingId: string | null }): {
  subject: "purchase" | "booking";
  subjectId: string;
} {
  if (payment.purchaseId) {
    return { subject: "purchase", subjectId: payment.purchaseId };
  }
  if (payment.bookingId) {
    return { subject: "booking", subjectId: payment.bookingId };
  }
  throw NOT_FOUND;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function lockPurchase(tx: Prisma.TransactionClient, purchaseId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM purchases WHERE id = ${purchaseId}::uuid FOR UPDATE`;
}

async function lockBooking(tx: Prisma.TransactionClient, bookingId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM rental_bookings WHERE id = ${bookingId}::uuid FOR UPDATE`;
}

export const paymentsService = {
  async createForPurchase(
    tx: Prisma.TransactionClient,
    input: { userId: string; purchaseId: string; amount: Prisma.Decimal },
  ): Promise<void> {
    await insertPayment(tx, {
      userId: input.userId,
      amount: input.amount,
      purchaseId: input.purchaseId,
      bookingId: null,
      subject: "purchase",
      subjectId: input.purchaseId,
    });
  },

  async captureOpen(tx: Prisma.TransactionClient, subject: Subject, amount: Prisma.Decimal): Promise<void> {
    const payment = await tx.payment.findFirst({
      where: { ...subject, status: PaymentStatus.PENDING },
      select: paymentSelect,
    });
    if (!payment) {
      throw MISSING;
    }
    if (!payment.amount.equals(amount)) {
      throw AMOUNT_MISMATCH;
    }
    const subjectRef = subjectOf(payment);
    assertPaymentTransition(payment.status, PaymentStatus.PROCESSING);
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.PROCESSING },
    });
    const captured = await paymentProvider.capture({
      amount: payment.amount,
      subject: subjectRef.subject,
      subjectId: subjectRef.subjectId,
    });
    assertPaymentTransition(PaymentStatus.PROCESSING, PaymentStatus.PAID);
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.PAID,
        provider: captured.provider,
        providerTransactionId: captured.providerTransactionId,
      },
    });
  },

  async refundPaid(tx: Prisma.TransactionClient, subject: Subject): Promise<void> {
    const payment = await tx.payment.findFirst({
      where: { ...subject, status: PaymentStatus.PAID },
      select: paymentSelect,
    });
    if (!payment) {
      throw MISSING;
    }
    assertPaymentTransition(payment.status, PaymentStatus.REFUNDED);
    const refunded = await paymentProvider.refund({
      amount: payment.amount,
      providerTransactionId: payment.providerTransactionId,
    });
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.REFUNDED, provider: refunded.provider },
    });
  },

  async cancelOpen(tx: Prisma.TransactionClient, subject: Subject): Promise<void> {
    const payment = await tx.payment.findFirst({
      where: {
        ...subject,
        status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] },
      },
      select: paymentSelect,
    });
    if (!payment) {
      return;
    }
    const subjectRef = subjectOf(payment);
    assertPaymentTransition(payment.status, PaymentStatus.CANCELLED);
    await paymentProvider.cancel({ subject: subjectRef.subject, subjectId: subjectRef.subjectId });
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.CANCELLED },
    });
  },

  async create(actorId: string, input: { purchaseId?: string; bookingId?: string }): Promise<PaymentView> {
    const userId = resolvePartyId(actorId);
    try {
      const paymentId = input.purchaseId
        ? await this.createPurchasePayment(userId, input.purchaseId)
        : await this.createBookingPayment(userId, input.bookingId ?? "");
      return this.load(paymentId);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw DUPLICATE;
      }
      throw error;
    }
  },

  async createPurchasePayment(userId: string, purchaseId: string): Promise<string> {
    return PrismaService.client().$transaction(async (tx) => {
      await lockPurchase(tx, purchaseId);
      const purchase = await tx.purchase.findUnique({
        where: { id: purchaseId },
        select: { id: true, buyerId: true, sellerId: true, price: true, status: true },
      });
      if (!purchase || (purchase.buyerId !== userId && purchase.sellerId !== userId)) {
        throw PURCHASE_NOT_FOUND;
      }
      if (purchase.buyerId !== userId) {
        throw FORBIDDEN;
      }
      if (purchase.status !== PurchaseStatus.PENDING && purchase.status !== PurchaseStatus.CONFIRMED) {
        throw NOT_READY;
      }
      const created = await insertPayment(tx, {
        userId,
        amount: purchase.price,
        purchaseId: purchase.id,
        bookingId: null,
        subject: "purchase",
        subjectId: purchase.id,
      });
      return created;
    });
  },

  async createBookingPayment(userId: string, bookingId: string): Promise<string> {
    return PrismaService.client().$transaction(async (tx) => {
      await lockBooking(tx, bookingId);
      const booking = await tx.rentalBooking.findUnique({
        where: { id: bookingId },
        select: { id: true, renterId: true, ownerId: true, totalPrice: true, status: true },
      });
      if (!booking || (booking.renterId !== userId && booking.ownerId !== userId)) {
        throw BOOKING_NOT_FOUND;
      }
      if (booking.renterId !== userId) {
        throw FORBIDDEN;
      }
      if (booking.status !== RentalBookingStatus.CONFIRMED) {
        throw NOT_READY;
      }
      return insertPayment(tx, {
        userId,
        amount: booking.totalPrice,
        purchaseId: null,
        bookingId: booking.id,
        subject: "booking",
        subjectId: booking.id,
      });
    });
  },

  async getForActor(actor: Actor, id: string): Promise<PaymentView> {
    const payment = await PrismaService.client().payment.findUnique({
      where: { id },
      select: paymentSelect,
    });
    if (!payment || (payment.userId !== actor.id && !isStaff(actor.role))) {
      throw NOT_FOUND;
    }
    return toView(payment);
  },

  async listForUser(actorId: string, query: PaymentListQuery): Promise<PaymentList> {
    const userId = resolvePartyId(actorId);
    const where: Prisma.PaymentWhereInput = {
      userId,
      ...(query.status ? { status: query.status } : {}),
    };
    const [total, payments] = await PrismaService.client().$transaction([
      PrismaService.client().payment.count({ where }),
      PrismaService.client().payment.findMany({
        where,
        select: paymentSelect,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return { payments: payments.map(toView), pagination: pageOf(query.page, query.limit, total) };
  },

  async listForAdmin(query: PaymentListQuery): Promise<PaymentList> {
    const where: Prisma.PaymentWhereInput = query.status ? { status: query.status } : {};
    const [total, payments] = await PrismaService.client().$transaction([
      PrismaService.client().payment.count({ where }),
      PrismaService.client().payment.findMany({
        where,
        select: paymentSelect,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return { payments: payments.map(toView), pagination: pageOf(query.page, query.limit, total) };
  },

  async payBooking(actorId: string, paymentId: string): Promise<void> {
    const userId = resolvePartyId(actorId);
    await PrismaService.client().$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        select: { id: true, userId: true, bookingId: true, amount: true, status: true },
      });
      if (!payment?.bookingId || payment.userId !== userId) {
        throw NOT_FOUND;
      }
      await lockBooking(tx, payment.bookingId);
      const booking = await tx.rentalBooking.findUnique({
        where: { id: payment.bookingId },
        select: { id: true, status: true, totalPrice: true, carId: true },
      });
      if (!booking) {
        throw BOOKING_NOT_FOUND;
      }
      await tx.$queryRaw`SELECT id FROM cars WHERE id = ${booking.carId}::uuid FOR UPDATE`;
      assertBookingTransition(booking.status, RentalBookingStatus.ACTIVE);
      await this.captureOpen(tx, { bookingId: booking.id }, booking.totalPrice);
      await tx.rentalBooking.update({
        where: { id: booking.id },
        data: { status: RentalBookingStatus.ACTIVE },
      });
      await markRentalOccupied(tx, booking.carId);
      await auditService.write(tx, {
        actorId: userId,
        action: AuditAction.PAYMENT_UPDATED,
        resource: "payment",
        resourceId: payment.id,
        metadata: { status: "PAID" },
      });
    });
  },

  async cancel(actorId: string, paymentId: string): Promise<PaymentView> {
    const userId = resolvePartyId(actorId);
    await PrismaService.client().$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        select: paymentSelect,
      });
      if (!payment || payment.userId !== userId) {
        throw NOT_FOUND;
      }
      assertPaymentTransition(payment.status, PaymentStatus.CANCELLED);
      if (payment.bookingId) {
        await lockBooking(tx, payment.bookingId);
        const booking = await tx.rentalBooking.findUnique({
          where: { id: payment.bookingId },
          select: { id: true, status: true, carId: true },
        });
        if (!booking) {
          throw BOOKING_NOT_FOUND;
        }
        await tx.$queryRaw`SELECT id FROM cars WHERE id = ${booking.carId}::uuid FOR UPDATE`;
        assertBookingTransition(booking.status, RentalBookingStatus.CANCELLED);
        await tx.rentalBooking.update({
          where: { id: booking.id },
          data: { status: RentalBookingStatus.CANCELLED },
        });
        await releaseRentalIfIdle(tx, booking.carId);
      }
      const subject = subjectOf(payment);
      await paymentProvider.cancel({ subject: subject.subject, subjectId: subject.subjectId });
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.CANCELLED },
      });
      await auditService.write(tx, {
        actorId: userId,
        action: AuditAction.PAYMENT_UPDATED,
        resource: "payment",
        resourceId: payment.id,
        metadata: { status: PaymentStatus.CANCELLED },
      });
      if (payment.bookingId) {
        await auditService.write(tx, {
          actorId: userId,
          action: AuditAction.BOOKING_CANCELLED,
          resource: "booking",
          resourceId: payment.bookingId,
        });
      }
    });
    return this.load(paymentId);
  },

  async load(id: string): Promise<PaymentView> {
    const payment = await PrismaService.client().payment.findUnique({
      where: { id },
      select: paymentSelect,
    });
    if (!payment) {
      throw NOT_FOUND;
    }
    return toView(payment);
  },

  async requirePayerPayment(actorId: string, id: string): Promise<PaymentRecord> {
    const payment = await PrismaService.client().payment.findUnique({
      where: { id },
      select: paymentSelect,
    });
    if (!payment || payment.userId !== resolvePartyId(actorId)) {
      throw NOT_FOUND;
    }
    return payment;
  },
};

async function insertPayment(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    amount: Prisma.Decimal;
    purchaseId: string | null;
    bookingId: string | null;
    subject: "purchase" | "booking";
    subjectId: string;
  },
): Promise<string> {
  const open = await tx.payment.findFirst({
    where: {
      ...(input.purchaseId ? { purchaseId: input.purchaseId } : { bookingId: input.bookingId ?? undefined }),
      status: { in: [...OPEN_PAYMENT_STATUSES] },
    },
    select: { id: true },
  });
  if (open) {
    throw DUPLICATE;
  }
  const intent = await paymentProvider.createIntent({
    amount: input.amount,
    subject: input.subject,
    subjectId: input.subjectId,
  });
  const created = await tx.payment.create({
    data: {
      userId: input.userId,
      purchaseId: input.purchaseId,
      bookingId: input.bookingId,
      amount: input.amount,
      currency: intent.currency,
      status: PaymentStatus.PENDING,
      provider: intent.provider,
      providerTransactionId: intent.providerTransactionId,
    },
    select: { id: true },
  });
  return created.id;
}
