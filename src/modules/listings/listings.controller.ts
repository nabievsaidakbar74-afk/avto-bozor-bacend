import type { Request, Response } from "express";
import { AppError } from "../../common/errors/app-error.js";
import { isRoleName, type RoleName } from "../../common/security/roles.js";
import { sendSuccess } from "../../common/utils/api-response.js";
import { asyncHandler } from "../../common/utils/async-handler.js";
import type {
  CreateListingInput,
  ListingIdParams,
  ListListingsQuery,
  MyListingsQuery,
  UpdateListingInput,
} from "./listings.dto.js";
import { listingsService } from "./listings.service.js";

function actor(req: Request): { id: string; role: RoleName } {
  if (!req.actor || !isRoleName(req.actor.role)) {
    throw new AppError("Authentication required", 401, "UNAUTHORIZED");
  }
  return { id: req.actor.id, role: req.actor.role };
}

function optionalActor(req: Request): { id: string; role: RoleName } | undefined {
  if (!req.actor || !isRoleName(req.actor.role)) {
    return undefined;
  }
  return { id: req.actor.id, role: req.actor.role };
}

export const listingsController = {
  list: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await listingsService.list(req.query as unknown as ListListingsQuery);
    sendSuccess(res, "Listings", result);
  }),

  mine: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await listingsService.listMine(actor(req).id, req.query as unknown as MyListingsQuery);
    sendSuccess(res, "Your listings", result);
  }),

  getById: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const params = req.params as unknown as ListingIdParams;
    const listing = await listingsService.getById(params.id, optionalActor(req));
    sendSuccess(res, "Listing", { listing });
  }),

  create: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const listing = await listingsService.create(actor(req).id, req.body as CreateListingInput);
    sendSuccess(res, "Listing created", { listing }, 201);
  }),

  update: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const params = req.params as unknown as ListingIdParams;
    const listing = await listingsService.update(actor(req), params.id, req.body as UpdateListingInput);
    sendSuccess(res, "Listing updated", { listing });
  }),

  remove: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const params = req.params as unknown as ListingIdParams;
    await listingsService.remove(actor(req), params.id);
    sendSuccess(res, "Listing deleted");
  }),
};
