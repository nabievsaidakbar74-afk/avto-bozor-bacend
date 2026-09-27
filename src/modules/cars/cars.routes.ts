import { Router } from "express";
import { authenticate } from "../../common/guards/authenticate.js";
import { authenticateOptional } from "../../common/guards/authenticate-optional.js";
import { authorize } from "../../common/guards/authorize.js";
import { requireActiveAccount } from "../../common/guards/require-active-account.js";
import { validate } from "../../common/middleware/validate.middleware.js";
import { Permission } from "../../common/security/permissions.js";
import { reviewsController } from "../reviews/reviews.controller.js";
import { reviewsValidation } from "../reviews/reviews.validation.js";
import { uploadCarImage } from "./car-image.upload.js";
import { carsController } from "./cars.controller.js";
import { carsValidation } from "./cars.validation.js";

export const carsRouter = Router();

carsRouter.get(
  "/:carId/reviews",
  validate({ params: reviewsValidation.carParam, query: reviewsValidation.list }),
  reviewsController.listForCar,
);

carsRouter.get("/:id", authenticateOptional, validate({ params: carsValidation.idParam }), carsController.getById);

carsRouter.get("/", validate({ query: carsValidation.list }), carsController.list);

carsRouter.post(
  "/",
  authenticate,
  requireActiveAccount,
  authorize({ permissions: [Permission.CAR_CREATE] }),
  validate({ body: carsValidation.create }),
  carsController.create,
);

carsRouter.patch(
  "/:id",
  authenticate,
  requireActiveAccount,
  authorize({ permissions: [Permission.CAR_UPDATE] }),
  validate({ params: carsValidation.idParam, body: carsValidation.update }),
  carsController.update,
);

carsRouter.post(
  "/:carId/images",
  authenticate,
  requireActiveAccount,
  authorize({ permissions: [Permission.CAR_UPDATE] }),
  validate({ params: carsValidation.imageParams }),
  uploadCarImage,
  carsController.addImage,
);

carsRouter.patch(
  "/:carId/images/order",
  authenticate,
  requireActiveAccount,
  authorize({ permissions: [Permission.CAR_UPDATE] }),
  validate({ params: carsValidation.imageParams, body: carsValidation.reorderImages }),
  carsController.reorderImages,
);

carsRouter.patch(
  "/:carId/images/:imageId/main",
  authenticate,
  requireActiveAccount,
  authorize({ permissions: [Permission.CAR_UPDATE] }),
  validate({ params: carsValidation.deleteImageParams }),
  carsController.setMainImage,
);

carsRouter.delete(
  "/:carId/images/:imageId",
  authenticate,
  requireActiveAccount,
  authorize({ permissions: [Permission.CAR_DELETE] }),
  validate({ params: carsValidation.deleteImageParams }),
  carsController.removeImage,
);

carsRouter.delete(
  "/:id",
  authenticate,
  requireActiveAccount,
  authorize({ permissions: [Permission.CAR_DELETE] }),
  validate({ params: carsValidation.idParam }),
  carsController.remove,
);
