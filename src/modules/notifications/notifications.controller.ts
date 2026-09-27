import type { Request, Response } from "express";
import { AppError } from "../../common/errors/app-error.js";
import { sendSuccess } from "../../common/utils/api-response.js";
import { asyncHandler } from "../../common/utils/async-handler.js";
import type { NotificationIdParams, NotificationListQuery } from "./notifications.dto.js";
import { notificationsService } from "./notifications.service.js";

function actorId(req: Request): string {
  if (!req.actor) {
    throw new AppError("Authentication required", 401, "UNAUTHORIZED");
  }
  return req.actor.id;
}

export const notificationsController = {
  list: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await notificationsService.list(actorId(req), req.query as unknown as NotificationListQuery);
    sendSuccess(res, "Your notifications", result);
  }),

  markRead: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const params = req.params as unknown as NotificationIdParams;
    const notification = await notificationsService.markRead(actorId(req), params.id);
    sendSuccess(res, "Notification marked as read", { notification });
  }),

  markAllRead: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await notificationsService.markAllRead(actorId(req));
    sendSuccess(res, "Notifications marked as read", result);
  }),
};
