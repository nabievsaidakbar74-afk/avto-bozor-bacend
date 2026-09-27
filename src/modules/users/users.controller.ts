import type { Request, Response } from "express";
import { AppError } from "../../common/errors/app-error.js";
import { requireActorId } from "../../common/security/ownership.js";
import { sendSuccess } from "../../common/utils/api-response.js";
import { asyncHandler } from "../../common/utils/async-handler.js";
import type { UpdateProfileInput } from "./users.dto.js";
import { usersService } from "./users.service.js";

function actorId(req: Request): string {
  return requireActorId(req.actor ? { sub: req.actor.id } : req.auth);
}

export const usersController = {
  me: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const user = req.actor ?? (await usersService.getOwnProfile(actorId(req)));
    sendSuccess(res, "Profile", { user });
  }),

  updateMe: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.actor && !req.auth) {
      throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    }
    const user = await usersService.updateOwnProfile(actorId(req), req.body as UpdateProfileInput);
    sendSuccess(res, "Profile updated", { user });
  }),
};
