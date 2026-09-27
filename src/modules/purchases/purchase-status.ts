import { PurchaseStatus } from "@prisma/client";
import { AppError } from "../../common/errors/app-error.js";

const transitions: Record<PurchaseStatus, readonly PurchaseStatus[]> = {
  [PurchaseStatus.PENDING]: [PurchaseStatus.CONFIRMED, PurchaseStatus.CANCELLED],
  [PurchaseStatus.CONFIRMED]: [PurchaseStatus.PAID, PurchaseStatus.CANCELLED],
  [PurchaseStatus.PAID]: [PurchaseStatus.COMPLETED, PurchaseStatus.REFUNDED],
  [PurchaseStatus.COMPLETED]: [PurchaseStatus.REFUNDED],
  [PurchaseStatus.CANCELLED]: [],
  [PurchaseStatus.REFUNDED]: [],
};

const OPEN_STATUSES: readonly PurchaseStatus[] = [
  PurchaseStatus.PENDING,
  PurchaseStatus.CONFIRMED,
  PurchaseStatus.PAID,
  PurchaseStatus.COMPLETED,
];

export function isOpenPurchase(status: PurchaseStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

export function canTransitionPurchase(from: PurchaseStatus, to: PurchaseStatus): boolean {
  if (from === to) {
    return false;
  }
  return transitions[from].includes(to);
}

export function assertPurchaseTransition(from: PurchaseStatus, to: PurchaseStatus): void {
  if (!canTransitionPurchase(from, to)) {
    throw new AppError("This status change is not allowed", 409, "INVALID_STATUS_TRANSITION");
  }
}
