import { PurchaseStatus } from "@prisma/client";
import type { Request, Response } from "express";
import { AppError } from "../../common/errors/app-error.js";
import { isRoleName, type RoleName } from "../../common/security/roles.js";
import { sendSuccess } from "../../common/utils/api-response.js";
import { asyncHandler } from "../../common/utils/async-handler.js";
import { purchasesService } from "../purchases/purchases.service.js";
import type { CreatePaymentInput, PaymentIdParams, PaymentListQuery } from "./payments.dto.js";
import { paymentsService } from "./payments.service.js";

function actor(req: Request): { id: string; role: RoleName } {
  if (!req.actor || !isRoleName(req.actor.role)) {
    throw new AppError("Authentication required", 401, "UNAUTHORIZED");
  }
  return { id: req.actor.id, role: req.actor.role };
}

function requestMeta(req: Request): { ip: string | null; userAgent: string | null } {
  return {
    ip: req.ip ?? null,
    userAgent: req.get("user-agent") ?? null,
  };
}

export const paymentsController = {
  create: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const payment = await paymentsService.create(actor(req).id, req.body as CreatePaymentInput);
    sendSuccess(res, "Payment created", { payment }, 201);
  }),

  getById: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const params = req.params as unknown as PaymentIdParams;
    const payment = await paymentsService.getForActor(actor(req), params.id);
    sendSuccess(res, "Payment", { payment });
  }),

  myPayments: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await paymentsService.listForUser(actor(req).id, req.query as unknown as PaymentListQuery);
    sendSuccess(res, "Your payments", result);
  }),

  adminList: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await paymentsService.listForAdmin(req.query as unknown as PaymentListQuery);
    sendSuccess(res, "Payments", result);
  }),

  pay: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const params = req.params as unknown as PaymentIdParams;
    const current = actor(req);
    const payment = await paymentsService.requirePayerPayment(current.id, params.id);
    if (payment.purchaseId) {
      await purchasesService.changeStatus(current, payment.purchaseId, PurchaseStatus.PAID, requestMeta(req));
    } else if (payment.bookingId) {
      await paymentsService.payBooking(current.id, payment.id);
    } else {
      throw new AppError("Payment not found", 404, "NOT_FOUND");
    }
    sendSuccess(res, "Payment completed", { payment: await paymentsService.getForActor(current, payment.id) });
  }),

  cancel: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const params = req.params as unknown as PaymentIdParams;
    const current = actor(req);
    const payment = await paymentsService.requirePayerPayment(current.id, params.id);
    if (payment.purchaseId) {
      await purchasesService.changeStatus(current, payment.purchaseId, PurchaseStatus.CANCELLED, requestMeta(req));
    } else {
      await paymentsService.cancel(current.id, payment.id);
    }
    sendSuccess(res, "Payment cancelled", { payment: await paymentsService.getForActor(current, payment.id) });
  }),

  refund: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const params = req.params as unknown as PaymentIdParams;
    const current = actor(req);
    const payment = await paymentsService.getForActor(current, params.id);
    if (!payment.purchaseId) {
      throw new AppError("This payment cannot be refunded", 409, "INVALID_STATUS_TRANSITION");
    }
    await purchasesService.changeStatus(current, payment.purchaseId, PurchaseStatus.REFUNDED, requestMeta(req));
    sendSuccess(res, "Payment refunded", { payment: await paymentsService.getForActor(current, payment.id) });
  }),
};
