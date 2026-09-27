import { Router } from "express";
import { authenticate } from "../../common/guards/authenticate.js";
import { authorize } from "../../common/guards/authorize.js";
import { requireActiveAccount } from "../../common/guards/require-active-account.js";
import { validate } from "../../common/middleware/validate.middleware.js";
import { Permission } from "../../common/security/permissions.js";
import { rentalsController } from "./rentals.controller.js";
import { rentalsValidation } from "./rentals.validation.js";

export const rentalsRouter = Router();

rentalsRouter.post(
  "/",
  authenticate,
  requireActiveAccount,
  authorize({ permissions: [Permission.RENTAL_CREATE] }),
  validate({ body: rentalsValidation.publish }),
  rentalsController.publish,
);
