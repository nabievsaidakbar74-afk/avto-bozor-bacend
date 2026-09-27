import { Router } from "express";
import { authenticate } from "../../common/guards/authenticate.js";
import { authorize } from "../../common/guards/authorize.js";
import { requireActiveAccount } from "../../common/guards/require-active-account.js";
import { validate } from "../../common/middleware/validate.middleware.js";
import { Permission } from "../../common/security/permissions.js";
import { RoleName } from "../../common/security/roles.js";
import { paymentsController } from "./payments.controller.js";
import { paymentsValidation } from "./payments.validation.js";

export const paymentsRouter = Router();
export const myPaymentsRouter = Router();

const privateRoute = [authenticate, requireActiveAccount] as const;
const staffRoles = [RoleName.ADMIN, RoleName.SUPER_ADMIN] as const;

paymentsRouter.post(
  "/",
  ...privateRoute,
  authorize({ permissions: [Permission.PAYMENT_READ] }),
  validate({ body: paymentsValidation.create }),
  paymentsController.create,
);

paymentsRouter.get(
  "/:id",
  ...privateRoute,
  authorize({ permissions: [Permission.PAYMENT_READ] }),
  validate({ params: paymentsValidation.idParam }),
  paymentsController.getById,
);

paymentsRouter.post(
  "/:id/pay",
  ...privateRoute,
  authorize({ permissions: [Permission.PAYMENT_READ] }),
  validate({ params: paymentsValidation.idParam }),
  paymentsController.pay,
);

paymentsRouter.post(
  "/:id/cancel",
  ...privateRoute,
  authorize({ permissions: [Permission.PAYMENT_READ] }),
  validate({ params: paymentsValidation.idParam }),
  paymentsController.cancel,
);

myPaymentsRouter.get(
  "/",
  ...privateRoute,
  authorize({ permissions: [Permission.PAYMENT_READ] }),
  validate({ query: paymentsValidation.list }),
  paymentsController.myPayments,
);

export const adminPaymentsRouter = Router();

adminPaymentsRouter.get(
  "/",
  ...privateRoute,
  authorize({ roles: staffRoles, permissions: [Permission.PAYMENT_READ] }),
  validate({ query: paymentsValidation.list }),
  paymentsController.adminList,
);

adminPaymentsRouter.post(
  "/:id/refund",
  ...privateRoute,
  authorize({ roles: staffRoles, permissions: [Permission.PAYMENT_READ] }),
  validate({ params: paymentsValidation.idParam }),
  paymentsController.refund,
);
