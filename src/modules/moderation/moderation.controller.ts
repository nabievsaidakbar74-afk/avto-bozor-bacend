import type { Request, Response } from "express";
import { AppError } from "../../common/errors/app-error.js";
import { sendSuccess } from "../../common/utils/api-response.js";
import { asyncHandler } from "../../common/utils/async-handler.js";
import type { ModerationListingParams, PendingListingsQuery, RejectListingInput } from "./moderation.dto.js";
import { moderationService } from "./moderation.service.js";

function actorId(req: Request): string {
  if (!req.actor) {
    throw new AppError("Authentication required", 401, "UNAUTHORIZED");
  }
  return req.actor.id;
}

function requestMeta(req: Request): { ip: string | null; userAgent: string | null } {
  return {
    ip: req.ip ?? null,
    userAgent: req.get("user-agent") ?? null,
  };
}

export const moderationController = {
  pending: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await moderationService.listPending(req.query as unknown as PendingListingsQuery);
    sendSuccess(res, "Listings pending moderation", result);
  }),

  approve: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const params = req.params as unknown as ModerationListingParams;
    const listing = await moderationService.approve(actorId(req), params.id, requestMeta(req));
    sendSuccess(res, "Listing approved", { listing });
  }),

  reject: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const params = req.params as unknown as ModerationListingParams;
    const listing = await moderationService.reject(
      actorId(req),
      params.id,
      req.body as RejectListingInput,
      requestMeta(req),
    );
    sendSuccess(res, "Listing rejected", { listing });
  }),
};
