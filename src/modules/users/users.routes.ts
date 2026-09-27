import { Router } from "express";
import { authenticate } from "../../common/guards/authenticate.js";
import { authorize } from "../../common/guards/authorize.js";
import { requireActiveAccount } from "../../common/guards/require-active-account.js";
import { validate } from "../../common/middleware/validate.middleware.js";
import { Permission } from "../../common/security/permissions.js";
import { usersController } from "./users.controller.js";
import { usersValidation } from "./users.validation.js";

export const usersRouter = Router();

usersRouter.get(
  "/me",
  authenticate,
  requireActiveAccount,
  authorize({ permissions: [Permission.USER_READ] }),
  usersController.me,
);

usersRouter.patch(
  "/me",
  authenticate,
  requireActiveAccount,
  authorize({ permissions: [Permission.USER_UPDATE] }),
  validate({ body: usersValidation.updateProfile }),
  usersController.updateMe,
);
