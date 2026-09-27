import { describe, expect, it } from "vitest";
import { AppError } from "../../src/common/errors/app-error.js";
import {
  assertCanModifyCar,
  assertCanModifyListing,
  assertCanViewBooking,
  assertCanViewPurchase,
  assertCanViewSale,
  assertResourceOwner,
  dropClientActorFields,
  ownPurchasesWhere,
  ownSalesWhere,
  resolvePartyId,
} from "../../src/common/security/ownership.js";
import { RoleName } from "../../src/common/security/roles.js";

const actorId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";

describe("ownership", () => {
  it("derives party ids from the authenticated user", () => {
    expect(resolvePartyId(actorId, otherId)).toBe(actorId);
    expect(ownPurchasesWhere(actorId)).toEqual({ buyerId: actorId });
    expect(ownSalesWhere(actorId)).toEqual({ sellerId: actorId });
    expect(
      dropClientActorFields({
        title: "Gentra",
        ownerId: otherId,
        sellerId: otherId,
        buyerId: otherId,
        renterId: otherId,
      }),
    ).toEqual({ title: "Gentra" });
  });

  it("hides another user's cars, purchases, sales, and bookings", () => {
    expect(() => {
      assertResourceOwner(actorId, otherId);
    }).toThrow(AppError);
    expect(() => {
      assertCanViewPurchase(actorId, otherId);
    }).toThrow(AppError);
    expect(() => {
      assertCanViewSale(actorId, otherId);
    }).toThrow(AppError);
    expect(() => {
      assertCanViewBooking(actorId, { renterId: otherId, ownerId: otherId });
    }).toThrow(AppError);
    expect(() => {
      assertCanViewBooking(actorId, { renterId: actorId, ownerId: otherId });
    }).not.toThrow();
  });

  it("lets the owner or an admin modify a car", () => {
    expect(() => {
      assertCanModifyCar(actorId, RoleName.USER, otherId);
    }).toThrow(AppError);
    expect(() => {
      assertCanModifyCar(actorId, RoleName.USER, actorId);
    }).not.toThrow();
    expect(() => {
      assertCanModifyCar(actorId, RoleName.ADMIN, otherId);
    }).not.toThrow();
    expect(() => {
      assertCanModifyCar(actorId, RoleName.MODERATOR, otherId);
    }).toThrow(AppError);
  });

  it("lets a user edit only their own listing unless they can moderate", () => {
    expect(() => {
      assertCanModifyListing(actorId, RoleName.USER, otherId);
    }).toThrow(AppError);
    expect(() => {
      assertCanModifyListing(actorId, RoleName.USER, actorId);
    }).not.toThrow();
    expect(() => {
      assertCanModifyListing(actorId, RoleName.MODERATOR, otherId);
    }).not.toThrow();
  });
});
