import { Router } from "express";
import { authenticate } from "../../common/guards/authenticate.js";
import { authenticateOptional } from "../../common/guards/authenticate-optional.js";
import { authorize } from "../../common/guards/authorize.js";
import { requireActiveAccount } from "../../common/guards/require-active-account.js";
import { validate } from "../../common/middleware/validate.middleware.js";
import { Permission } from "../../common/security/permissions.js";
import { listingsController } from "./listings.controller.js";
import { listingsValidation } from "./listings.validation.js";

export const listingsRouter = Router();
export const myListingsRouter = Router();

listingsRouter.get("/", validate({ query: listingsValidation.list }), listingsController.list);

listingsRouter.get(
  "/:id",
  authenticateOptional,
  validate({ params: listingsValidation.idParam }),
  listingsController.getById,
);

listingsRouter.post(
  "/",
  authenticate,
  requireActiveAccount,
  authorize({ permissions: [Permission.LISTING_CREATE] }),
  validate({ body: listingsValidation.create }),
  listingsController.create,
);

listingsRouter.patch(
  "/:id",
  authenticate,
  requireActiveAccount,
  authorize({ permissions: [Permission.LISTING_UPDATE] }),
  validate({ params: listingsValidation.idParam, body: listingsValidation.update }),
  listingsController.update,
);

listingsRouter.delete(
  "/:id",
  authenticate,
  requireActiveAccount,
  authorize({ permissions: [Permission.LISTING_DELETE] }),
  validate({ params: listingsValidation.idParam }),
  listingsController.remove,
);

myListingsRouter.get(
  "/",
  authenticate,
  requireActiveAccount,
  authorize({ permissions: [Permission.LISTING_CREATE] }),
  validate({ query: listingsValidation.mine }),
  listingsController.mine,
);
