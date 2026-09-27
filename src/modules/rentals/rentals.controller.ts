import type { Request, Response } from "express";
import { AppError } from "../../common/errors/app-error.js";
import { sendSuccess } from "../../common/utils/api-response.js";
import { asyncHandler } from "../../common/utils/async-handler.js";
import type { PublishRentalInput } from "./rentals.dto.js";
import { rentalsService } from "./rentals.service.js";

export const rentalsController = {
  publish: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.actor) {
      throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    }
    const listing = await rentalsService.publish(req.actor.id, req.body as PublishRentalInput);
    sendSuccess(res, "Rental submitted for moderation", { listing }, 201);
  }),
};
