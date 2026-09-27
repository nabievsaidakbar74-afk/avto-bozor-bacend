import { PurchaseStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { canTransitionPurchase } from "../../src/modules/purchases/purchase-status.js";

describe("purchase status transitions", () => {
  it("follows the sale lifecycle and rejects skipped states", () => {
    expect(canTransitionPurchase(PurchaseStatus.PENDING, PurchaseStatus.CONFIRMED)).toBe(true);
    expect(canTransitionPurchase(PurchaseStatus.CONFIRMED, PurchaseStatus.PAID)).toBe(true);
    expect(canTransitionPurchase(PurchaseStatus.PAID, PurchaseStatus.COMPLETED)).toBe(true);
    expect(canTransitionPurchase(PurchaseStatus.PENDING, PurchaseStatus.CANCELLED)).toBe(true);
    expect(canTransitionPurchase(PurchaseStatus.PAID, PurchaseStatus.REFUNDED)).toBe(true);
    expect(canTransitionPurchase(PurchaseStatus.PENDING, PurchaseStatus.PAID)).toBe(false);
    expect(canTransitionPurchase(PurchaseStatus.PENDING, PurchaseStatus.COMPLETED)).toBe(false);
    expect(canTransitionPurchase(PurchaseStatus.COMPLETED, PurchaseStatus.CONFIRMED)).toBe(false);
    expect(canTransitionPurchase(PurchaseStatus.CANCELLED, PurchaseStatus.PENDING)).toBe(false);
  });
});
