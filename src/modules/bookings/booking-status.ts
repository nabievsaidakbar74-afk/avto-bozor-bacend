import { RentalBookingStatus } from "@prisma/client";
import { AppError } from "../../common/errors/app-error.js";

const transitions: Record<RentalBookingStatus, readonly RentalBookingStatus[]> = {
  [RentalBookingStatus.PENDING]: [
    RentalBookingStatus.CONFIRMED,
    RentalBookingStatus.REJECTED,
    RentalBookingStatus.CANCELLED,
  ],
  [RentalBookingStatus.CONFIRMED]: [RentalBookingStatus.ACTIVE, RentalBookingStatus.CANCELLED],
  [RentalBookingStatus.ACTIVE]: [RentalBookingStatus.COMPLETED],
  [RentalBookingStatus.COMPLETED]: [],
  [RentalBookingStatus.CANCELLED]: [],
  [RentalBookingStatus.REJECTED]: [],
};

export function canTransitionBooking(from: RentalBookingStatus, to: RentalBookingStatus): boolean {
  if (from === to) {
    return false;
  }
  return transitions[from].includes(to);
}

export function assertBookingTransition(from: RentalBookingStatus, to: RentalBookingStatus): void {
  if (!canTransitionBooking(from, to)) {
    throw new AppError("This status change is not allowed", 409, "INVALID_STATUS_TRANSITION");
  }
}
