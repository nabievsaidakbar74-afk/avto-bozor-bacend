import { Router } from "express";
import { authenticate } from "../../common/guards/authenticate.js";
import { authorize } from "../../common/guards/authorize.js";
import { requireActiveAccount } from "../../common/guards/require-active-account.js";
import { validate } from "../../common/middleware/validate.middleware.js";
import { Permission } from "../../common/security/permissions.js";
import { notificationsController } from "./notifications.controller.js";
import { notificationsValidation } from "./notifications.validation.js";

export const notificationsRouter = Router();

const privateRoute = [authenticate, requireActiveAccount] as const;

notificationsRouter.get(
  "/",
  ...privateRoute,
  authorize({ permissions: [Permission.NOTIFICATION_READ] }),
  validate({ query: notificationsValidation.list }),
  notificationsController.list,
);

notificationsRouter.patch(
  "/read-all",
  ...privateRoute,
  authorize({ permissions: [Permission.NOTIFICATION_READ] }),
  notificationsController.markAllRead,
);

notificationsRouter.patch(
  "/:id/read",
  ...privateRoute,
  authorize({ permissions: [Permission.NOTIFICATION_READ] }),
  validate({ params: notificationsValidation.idParam }),
  notificationsController.markRead,
);
