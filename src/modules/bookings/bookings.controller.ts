import type { Request, Response } from "express";
import { AppError } from "../../common/errors/app-error.js";
import { isRoleName, type RoleName } from "../../common/security/roles.js";
import { sendSuccess } from "../../common/utils/api-response.js";
import { asyncHandler } from "../../common/utils/async-handler.js";
import type { BookingIdParams, BookingListQuery, CreateBookingInput } from "./bookings.dto.js";
import { bookingsService } from "./bookings.service.js";

function actor(req: Request): { id: string; role: RoleName } {
  if (!req.actor || !isRoleName(req.actor.role)) {
    throw new AppError("Authentication required", 401, "UNAUTHORIZED");
  }
  return { id: req.actor.id, role: req.actor.role };
}

export const bookingsController = {
  create: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const booking = await bookingsService.create(actor(req).id, req.body as CreateBookingInput);
    sendSuccess(res, "Booking requested", { booking }, 201);
  }),

  myBookings: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await bookingsService.listForUser(
      actor(req).id,
      "renter",
      req.query as unknown as BookingListQuery,
    );
    sendSuccess(res, "Your bookings", result);
  }),

  myRentals: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await bookingsService.listForUser(
      actor(req).id,
      "owner",
      req.query as unknown as BookingListQuery,
    );
    sendSuccess(res, "Your rentals", result);
  }),

  confirm: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const params = req.params as unknown as BookingIdParams;
    const booking = await bookingsService.confirm(actor(req), params.id);
    sendSuccess(res, "Booking confirmed", { booking });
  }),

  reject: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const params = req.params as unknown as BookingIdParams;
    const booking = await bookingsService.reject(actor(req), params.id);
    sendSuccess(res, "Booking rejected", { booking });
  }),

  cancel: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const params = req.params as unknown as BookingIdParams;
    const booking = await bookingsService.cancel(actor(req), params.id);
    sendSuccess(res, "Booking cancelled", { booking });
  }),

  complete: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const params = req.params as unknown as BookingIdParams;
    const booking = await bookingsService.complete(actor(req), params.id);
    sendSuccess(res, "Booking completed", { booking });
  }),
};
