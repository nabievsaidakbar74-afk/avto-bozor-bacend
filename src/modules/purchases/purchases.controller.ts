import type { Request, Response } from "express";
import { PurchaseStatus } from "@prisma/client";
import { AppError } from "../../common/errors/app-error.js";
import { isRoleName, type RoleName } from "../../common/security/roles.js";
import { sendSuccess } from "../../common/utils/api-response.js";
import { asyncHandler } from "../../common/utils/async-handler.js";
import type {
  CreatePurchaseInput,
  PurchaseIdParams,
  PurchaseListQuery,
  UpdatePurchaseStatusInput,
} from "./purchases.dto.js";
import { purchasesService } from "./purchases.service.js";

function actor(req: Request): { id: string; role: RoleName } {
  if (!req.actor || !isRoleName(req.actor.role)) {
    throw new AppError("Authentication required", 401, "UNAUTHORIZED");
  }
  return { id: req.actor.id, role: req.actor.role };
}

export const purchasesController = {
  create: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const body = req.body as CreatePurchaseInput;
    const purchase = await purchasesService.create(actor(req).id, body.carId);
    sendSuccess(res, "Purchase created", { purchase }, 201);
  }),

  getById: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const params = req.params as unknown as PurchaseIdParams;
    const purchase = await purchasesService.getForParticipant(actor(req), params.id);
    sendSuccess(res, "Purchase", { purchase });
  }),

  myPurchases: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await purchasesService.listForUser(
      actor(req).id,
      "buyer",
      req.query as unknown as PurchaseListQuery,
    );
    sendSuccess(res, "Your purchases", result);
  }),

  mySales: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await purchasesService.listForUser(
      actor(req).id,
      "seller",
      req.query as unknown as PurchaseListQuery,
    );
    sendSuccess(res, "Your sales", result);
  }),

  adminList: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await purchasesService.listForAdmin(req.query as unknown as PurchaseListQuery);
    sendSuccess(res, "Sales", result);
  }),

  adminGet: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const params = req.params as unknown as PurchaseIdParams;
    const purchase = await purchasesService.getForAdmin(params.id);
    sendSuccess(res, "Sale", { purchase });
  }),

  adminUpdateStatus: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const params = req.params as unknown as PurchaseIdParams;
    const body = req.body as UpdatePurchaseStatusInput;
    const purchase = await purchasesService.changeStatus(actor(req), params.id, body.status, {
      ip: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    });
    sendSuccess(res, "Sale updated", { purchase });
  }),

  confirm: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const params = req.params as unknown as PurchaseIdParams;
    const purchase = await purchasesService.changeStatus(actor(req), params.id, PurchaseStatus.CONFIRMED);
    sendSuccess(res, "Purchase confirmed", { purchase });
  }),

  cancel: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const params = req.params as unknown as PurchaseIdParams;
    const purchase = await purchasesService.changeStatus(actor(req), params.id, PurchaseStatus.CANCELLED);
    sendSuccess(res, "Purchase cancelled", { purchase });
  }),

  pay: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const params = req.params as unknown as PurchaseIdParams;
    const purchase = await purchasesService.changeStatus(actor(req), params.id, PurchaseStatus.PAID);
    sendSuccess(res, "Purchase paid", { purchase });
  }),

  complete: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const params = req.params as unknown as PurchaseIdParams;
    const purchase = await purchasesService.changeStatus(actor(req), params.id, PurchaseStatus.COMPLETED);
    sendSuccess(res, "Purchase completed", { purchase });
  }),
};
