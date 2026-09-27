import type { Request, Response } from "express";
import { AppError } from "../../common/errors/app-error.js";
import { sendSuccess } from "../../common/utils/api-response.js";
import { asyncHandler } from "../../common/utils/async-handler.js";
import type { FavoriteCarParams, FavoriteListQuery } from "./favorites.dto.js";
import { favoritesService } from "./favorites.service.js";

function actorId(req: Request): string {
  if (!req.actor) {
    throw new AppError("Authentication required", 401, "UNAUTHORIZED");
  }
  return req.actor.id;
}

export const favoritesController = {
  add: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const params = req.params as unknown as FavoriteCarParams;
    const favorite = await favoritesService.add(actorId(req), params.carId);
    sendSuccess(res, "Car saved", { favorite }, 201);
  }),

  remove: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const params = req.params as unknown as FavoriteCarParams;
    await favoritesService.remove(actorId(req), params.carId);
    sendSuccess(res, "Car removed from favorites");
  }),

  list: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await favoritesService.list(actorId(req), req.query as unknown as FavoriteListQuery);
    sendSuccess(res, "Your favorites", result);
  }),
};
