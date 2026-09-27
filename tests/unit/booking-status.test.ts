import { RentalBookingStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { AppError } from "../../src/common/errors/app-error.js";
import { assertBookingTransition, canTransitionBooking } from "../../src/modules/bookings/booking-status.js";

describe("booking status transitions", () => {
  it("allows the rental lifecycle and blocks terminal changes", () => {
    expect(canTransitionBooking(RentalBookingStatus.PENDING, RentalBookingStatus.CONFIRMED)).toBe(true);
    expect(canTransitionBooking(RentalBookingStatus.PENDING, RentalBookingStatus.REJECTED)).toBe(true);
    expect(canTransitionBooking(RentalBookingStatus.PENDING, RentalBookingStatus.CANCELLED)).toBe(true);
    expect(canTransitionBooking(RentalBookingStatus.CONFIRMED, RentalBookingStatus.ACTIVE)).toBe(true);
    expect(canTransitionBooking(RentalBookingStatus.CONFIRMED, RentalBookingStatus.CANCELLED)).toBe(true);
    expect(canTransitionBooking(RentalBookingStatus.ACTIVE, RentalBookingStatus.COMPLETED)).toBe(true);
    expect(canTransitionBooking(RentalBookingStatus.CONFIRMED, RentalBookingStatus.COMPLETED)).toBe(false);
    expect(canTransitionBooking(RentalBookingStatus.COMPLETED, RentalBookingStatus.CANCELLED)).toBe(false);
    expect(canTransitionBooking(RentalBookingStatus.REJECTED, RentalBookingStatus.CONFIRMED)).toBe(false);
    expect(canTransitionBooking(RentalBookingStatus.CANCELLED, RentalBookingStatus.PENDING)).toBe(false);
    expect(canTransitionBooking(RentalBookingStatus.PENDING, RentalBookingStatus.PENDING)).toBe(false);
  });

  it("raises a conflict when a transition is not allowed", () => {
    expect(() => assertBookingTransition(RentalBookingStatus.CONFIRMED, RentalBookingStatus.REJECTED)).toThrow(AppError);
    try {
      assertBookingTransition(RentalBookingStatus.ACTIVE, RentalBookingStatus.CANCELLED);
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("INVALID_STATUS_TRANSITION");
      expect((error as AppError).statusCode).toBe(409);
    }
  });
});
