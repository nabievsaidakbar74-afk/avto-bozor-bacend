import type { Request, Response } from "express";
import { AppError } from "../../common/errors/app-error.js";
import { sendSuccess } from "../../common/utils/api-response.js";
import { asyncHandler } from "../../common/utils/async-handler.js";
import type { CreateReviewInput, ReviewCarParams, ReviewListQuery } from "./reviews.dto.js";
import { reviewsService } from "./reviews.service.js";

export const reviewsController = {
  create: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.actor) {
      throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    }
    const review = await reviewsService.create(req.actor.id, req.body as CreateReviewInput);
    sendSuccess(res, "Review published", { review }, 201);
  }),

  listForCar: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const params = req.params as unknown as ReviewCarParams;
    const result = await reviewsService.listForCar(params.carId, req.query as unknown as ReviewListQuery);
    sendSuccess(res, "Car reviews", result);
  }),
};
