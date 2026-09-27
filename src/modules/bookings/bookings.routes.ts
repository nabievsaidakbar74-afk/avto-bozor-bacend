import { Router } from "express";
import { authenticate } from "../../common/guards/authenticate.js";
import { authorize } from "../../common/guards/authorize.js";
import { requireActiveAccount } from "../../common/guards/require-active-account.js";
import { validate } from "../../common/middleware/validate.middleware.js";
import { Permission } from "../../common/security/permissions.js";
import { bookingsController } from "./bookings.controller.js";
import { bookingsValidation } from "./bookings.validation.js";

export const bookingsRouter = Router();
export const myBookingsRouter = Router();
export const myRentalsRouter = Router();

const privateRoute = [authenticate, requireActiveAccount] as const;

bookingsRouter.post(
  "/",
  ...privateRoute,
  authorize({ permissions: [Permission.BOOKING_CREATE] }),
  validate({ body: bookingsValidation.create }),
  bookingsController.create,
);

bookingsRouter.post(
  "/:id/confirm",
  ...privateRoute,
  authorize({ permissions: [Permission.BOOKING_UPDATE] }),
  validate({ params: bookingsValidation.idParam }),
  bookingsController.confirm,
);

bookingsRouter.post(
  "/:id/reject",
  ...privateRoute,
  authorize({ permissions: [Permission.BOOKING_UPDATE] }),
  validate({ params: bookingsValidation.idParam }),
  bookingsController.reject,
);

bookingsRouter.post(
  "/:id/cancel",
  ...privateRoute,
  authorize({ permissions: [Permission.BOOKING_UPDATE] }),
  validate({ params: bookingsValidation.idParam }),
  bookingsController.cancel,
);

bookingsRouter.post(
  "/:id/complete",
  ...privateRoute,
  authorize({ permissions: [Permission.BOOKING_UPDATE] }),
  validate({ params: bookingsValidation.idParam }),
  bookingsController.complete,
);

myBookingsRouter.get(
  "/",
  ...privateRoute,
  authorize({ permissions: [Permission.BOOKING_CREATE] }),
  validate({ query: bookingsValidation.list }),
  bookingsController.myBookings,
);

myRentalsRouter.get(
  "/",
  ...privateRoute,
  authorize({ permissions: [Permission.RENTAL_READ] }),
  validate({ query: bookingsValidation.list }),
  bookingsController.myRentals,
);
