import { PaymentStatus } from "@prisma/client";
import { AppError } from "../../common/errors/app-error.js";

const transitions: Record<PaymentStatus, readonly PaymentStatus[]> = {
  [PaymentStatus.PENDING]: [PaymentStatus.PROCESSING, PaymentStatus.CANCELLED, PaymentStatus.FAILED],
  [PaymentStatus.PROCESSING]: [PaymentStatus.PAID, PaymentStatus.FAILED, PaymentStatus.CANCELLED],
  [PaymentStatus.PAID]: [PaymentStatus.REFUNDED],
  [PaymentStatus.FAILED]: [],
  [PaymentStatus.CANCELLED]: [],
  [PaymentStatus.REFUNDED]: [],
};

export const OPEN_PAYMENT_STATUSES = [
  PaymentStatus.PENDING,
  PaymentStatus.PROCESSING,
  PaymentStatus.PAID,
] as const;

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  if (from === to) {
    return false;
  }
  return transitions[from].includes(to);
}

export function assertPaymentTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (!canTransitionPayment(from, to)) {
    throw new AppError("This status change is not allowed", 409, "INVALID_STATUS_TRANSITION");
  }
}
