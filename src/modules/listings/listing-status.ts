import { ListingStatus } from "@prisma/client";
import { AppError } from "../../common/errors/app-error.js";

export type ListingTransitionChannel = "owner" | "moderation" | "transaction";

const ownerTransitions: Record<ListingStatus, readonly ListingStatus[]> = {
  [ListingStatus.DRAFT]: [ListingStatus.PENDING_MODERATION],
  [ListingStatus.PENDING_MODERATION]: [ListingStatus.DRAFT],
  [ListingStatus.PUBLISHED]: [ListingStatus.PAUSED],
  [ListingStatus.PAUSED]: [ListingStatus.PENDING_MODERATION],
  [ListingStatus.REJECTED]: [ListingStatus.DRAFT, ListingStatus.PENDING_MODERATION],
  [ListingStatus.EXPIRED]: [ListingStatus.DRAFT, ListingStatus.PENDING_MODERATION],
  [ListingStatus.SOLD]: [],
  [ListingStatus.RENTED]: [],
};

const moderationTransitions: Record<ListingStatus, readonly ListingStatus[]> = {
  [ListingStatus.DRAFT]: [],
  [ListingStatus.PENDING_MODERATION]: [ListingStatus.PUBLISHED, ListingStatus.REJECTED],
  [ListingStatus.PUBLISHED]: [],
  [ListingStatus.PAUSED]: [],
  [ListingStatus.REJECTED]: [],
  [ListingStatus.EXPIRED]: [],
  [ListingStatus.SOLD]: [],
  [ListingStatus.RENTED]: [],
};

const transactionTransitions: Record<ListingStatus, readonly ListingStatus[]> = {
  [ListingStatus.DRAFT]: [],
  [ListingStatus.PENDING_MODERATION]: [],
  [ListingStatus.PUBLISHED]: [ListingStatus.SOLD, ListingStatus.RENTED],
  [ListingStatus.PAUSED]: [],
  [ListingStatus.REJECTED]: [],
  [ListingStatus.EXPIRED]: [],
  [ListingStatus.SOLD]: [ListingStatus.PUBLISHED],
  [ListingStatus.RENTED]: [ListingStatus.PUBLISHED],
};

const channels = {
  owner: ownerTransitions,
  moderation: moderationTransitions,
  transaction: transactionTransitions,
} as const;

export function canTransitionListing(
  from: ListingStatus,
  to: ListingStatus,
  channel: ListingTransitionChannel,
): boolean {
  if (from === to) {
    return true;
  }
  return channels[channel][from].includes(to);
}

export function assertListingTransition(
  from: ListingStatus,
  to: ListingStatus,
  channel: ListingTransitionChannel,
): void {
  if (!canTransitionListing(from, to, channel)) {
    throw new AppError("This status change is not allowed", 409, "INVALID_STATUS_TRANSITION");
  }
}
