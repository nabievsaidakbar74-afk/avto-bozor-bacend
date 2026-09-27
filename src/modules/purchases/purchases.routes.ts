import { Router } from "express";
import { authenticate } from "../../common/guards/authenticate.js";
import { authorize } from "../../common/guards/authorize.js";
import { requireActiveAccount } from "../../common/guards/require-active-account.js";
import { validate } from "../../common/middleware/validate.middleware.js";
import { Permission } from "../../common/security/permissions.js";
import { purchasesController } from "./purchases.controller.js";
import { purchasesValidation } from "./purchases.validation.js";

export const purchasesRouter = Router();
export const myPurchasesRouter = Router();
export const mySalesRouter = Router();

const privateRoute = [authenticate, requireActiveAccount] as const;

purchasesRouter.post(
  "/",
  ...privateRoute,
  authorize({ permissions: [Permission.SALE_CREATE] }),
  validate({ body: purchasesValidation.create }),
  purchasesController.create,
);

purchasesRouter.get(
  "/:id",
  ...privateRoute,
  authorize({ permissions: [Permission.SALE_READ] }),
  validate({ params: purchasesValidation.idParam }),
  purchasesController.getById,
);

purchasesRouter.post(
  "/:id/confirm",
  ...privateRoute,
  authorize({ permissions: [Permission.SALE_CREATE] }),
  validate({ params: purchasesValidation.idParam }),
  purchasesController.confirm,
);

purchasesRouter.post(
  "/:id/cancel",
  ...privateRoute,
  authorize({ permissions: [Permission.SALE_CREATE] }),
  validate({ params: purchasesValidation.idParam }),
  purchasesController.cancel,
);

purchasesRouter.post(
  "/:id/pay",
  ...privateRoute,
  authorize({ permissions: [Permission.SALE_CREATE] }),
  validate({ params: purchasesValidation.idParam }),
  purchasesController.pay,
);

purchasesRouter.post(
  "/:id/complete",
  ...privateRoute,
  authorize({ permissions: [Permission.SALE_CREATE] }),
  validate({ params: purchasesValidation.idParam }),
  purchasesController.complete,
);

myPurchasesRouter.get(
  "/",
  ...privateRoute,
  authorize({ permissions: [Permission.SALE_READ] }),
  validate({ query: purchasesValidation.list }),
  purchasesController.myPurchases,
);

mySalesRouter.get(
  "/",
  ...privateRoute,
  authorize({ permissions: [Permission.SALE_READ] }),
  validate({ query: purchasesValidation.list }),
  purchasesController.mySales,
);
