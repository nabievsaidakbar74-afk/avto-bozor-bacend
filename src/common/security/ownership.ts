import { AppError } from "../errors/app-error.js";
import { hasPermission, Permission } from "./permissions.js";
import type { RoleName } from "./roles.js";

export const CLIENT_ACTOR_FIELDS = ["ownerId", "sellerId", "buyerId", "renterId"] as const;

export type ClientActorField = (typeof CLIENT_ACTOR_FIELDS)[number];

const NOT_FOUND = new AppError("Resource not found", 404, "NOT_FOUND");

export function requireActorId(auth: { sub: string } | undefined): string {
  if (!auth?.sub) {
    throw new AppError("Authentication required", 401, "UNAUTHORIZED");
  }
  return auth.sub;
}

/**
 * Party ids on the caller's side of a record always come from the authenticated
 * user. A client-supplied owner, seller, buyer, or renter id is ignored.
 */
export function resolvePartyId(actorId: string, _clientPartyId?: unknown): string {
  return actorId;
}

export function dropClientActorFields<T extends Record<string, unknown>>(
  input: T,
): Omit<T, ClientActorField> {
  const copy: Record<string, unknown> = { ...input };
  for (const field of CLIENT_ACTOR_FIELDS) {
    delete copy[field];
  }
  return copy as Omit<T, ClientActorField>;
}

export function ownedCarWhere(actorId: string): { ownerId: string } {
  return { ownerId: actorId };
}

export function ownedListingWhere(actorId: string): { ownerId: string } {
  return { ownerId: actorId };
}

export function ownPurchasesWhere(actorId: string): { buyerId: string } {
  return { buyerId: actorId };
}

export function ownSalesWhere(actorId: string): { sellerId: string } {
  return { sellerId: actorId };
}

export function ownBookingsWhere(actorId: string): {
  OR: [{ renterId: string }, { ownerId: string }];
} {
  return {
    OR: [{ renterId: actorId }, { ownerId: actorId }],
  };
}

export function ownFavoritesWhere(actorId: string): { userId: string } {
  return { userId: actorId };
}

export function ownNotificationsWhere(actorId: string): { userId: string } {
  return { userId: actorId };
}

export function ownPaymentsWhere(actorId: string): { userId: string } {
  return { userId: actorId };
}

export function assertResourceOwner(actorId: string, ownerId: string): void {
  if (actorId !== ownerId) {
    throw NOT_FOUND;
  }
}

export function assertOwnerOrAdmin(actorId: string, role: RoleName, ownerId: string): void {
  if (actorId === ownerId) {
    return;
  }
  if (role === "ADMIN" || role === "SUPER_ADMIN") {
    return;
  }
  throw NOT_FOUND;
}

export function assertCanModifyCar(actorId: string, role: RoleName, ownerId: string): void {
  assertOwnerOrAdmin(actorId, role, ownerId);
}

export function assertCanViewPurchase(actorId: string, buyerId: string): void {
  if (actorId !== buyerId) {
    throw NOT_FOUND;
  }
}

export function assertCanViewSale(actorId: string, sellerId: string): void {
  if (actorId !== sellerId) {
    throw NOT_FOUND;
  }
}

export function assertCanViewBooking(
  actorId: string,
  booking: { renterId: string; ownerId: string },
): void {
  if (actorId !== booking.renterId && actorId !== booking.ownerId) {
    throw NOT_FOUND;
  }
}

export function assertCanModifyListing(
  actorId: string,
  role: RoleName,
  listingOwnerId: string,
): void {
  if (actorId === listingOwnerId) {
    return;
  }
  if (hasPermission(role, Permission.LISTING_MODERATE)) {
    return;
  }
  throw NOT_FOUND;
}
