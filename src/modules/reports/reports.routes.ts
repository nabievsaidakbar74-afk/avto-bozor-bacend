import { Router } from "express";
import { authenticate } from "../../common/guards/authenticate.js";
import { authorize } from "../../common/guards/authorize.js";
import { requireActiveAccount } from "../../common/guards/require-active-account.js";
import { validate } from "../../common/middleware/validate.middleware.js";
import { Permission } from "../../common/security/permissions.js";
import { reportsController } from "./reports.controller.js";
import { reportsValidation } from "./reports.validation.js";

export const reportsRouter = Router();
export const adminReportsRouter = Router();

reportsRouter.post(
  "/",
  authenticate,
  requireActiveAccount,
  validate({ body: reportsValidation.create }),
  reportsController.create,
);

reportsRouter.get(
  "/",
  authenticate,
  requireActiveAccount,
  validate({ query: reportsValidation.list }),
  reportsController.listOwn,
);

reportsRouter.get(
  "/:id",
  authenticate,
  requireActiveAccount,
  validate({ params: reportsValidation.idParam }),
  reportsController.getOwn,
);

adminReportsRouter.get(
  "/",
  authenticate,
  requireActiveAccount,
  authorize({ permissions: [Permission.REPORT_READ] }),
  validate({ query: reportsValidation.list }),
  reportsController.list,
);

adminReportsRouter.patch(
  "/:id",
  authenticate,
  requireActiveAccount,
  authorize({ permissions: [Permission.REPORT_MODERATE] }),
  validate({ params: reportsValidation.idParam, body: reportsValidation.update }),
  reportsController.update,
);
