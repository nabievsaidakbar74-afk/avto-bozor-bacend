import { Router } from "express";
import { authenticate } from "../../common/guards/authenticate.js";
import { authorize } from "../../common/guards/authorize.js";
import { requireActiveAccount } from "../../common/guards/require-active-account.js";
import { validate } from "../../common/middleware/validate.middleware.js";
import { Permission } from "../../common/security/permissions.js";
import { favoritesController } from "./favorites.controller.js";
import { favoritesValidation } from "./favorites.validation.js";

export const favoritesRouter = Router();

const privateRoute = [authenticate, requireActiveAccount] as const;

favoritesRouter.get(
  "/",
  ...privateRoute,
  authorize({ permissions: [Permission.FAVORITE_MANAGE] }),
  validate({ query: favoritesValidation.list }),
  favoritesController.list,
);

favoritesRouter.post(
  "/:carId",
  ...privateRoute,
  authorize({ permissions: [Permission.FAVORITE_MANAGE] }),
  validate({ params: favoritesValidation.carParam }),
  favoritesController.add,
);

favoritesRouter.delete(
  "/:carId",
  ...privateRoute,
  authorize({ permissions: [Permission.FAVORITE_MANAGE] }),
  validate({ params: favoritesValidation.carParam }),
  favoritesController.remove,
);
