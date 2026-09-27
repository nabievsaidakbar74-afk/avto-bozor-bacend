import { Router } from "express";
import { authenticate } from "../../common/guards/authenticate.js";
import { authorize } from "../../common/guards/authorize.js";
import { requireActiveAccount } from "../../common/guards/require-active-account.js";
import { validate } from "../../common/middleware/validate.middleware.js";
import { Permission } from "../../common/security/permissions.js";
import { reviewsController } from "./reviews.controller.js";
import { reviewsValidation } from "./reviews.validation.js";

export const reviewsRouter = Router();

reviewsRouter.post(
  "/",
  authenticate,
  requireActiveAccount,
  authorize({ permissions: [Permission.REVIEW_CREATE] }),
  validate({ body: reviewsValidation.create }),
  reviewsController.create,
);
