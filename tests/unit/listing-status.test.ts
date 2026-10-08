import { ListingStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { canTransitionListing } from "../../src/modules/listings/listing-status.js";

describe("listing status transitions", () => {
  it("lets an owner submit and pause, but not publish or close a sale", () => {
    expect(canTransitionListing(ListingStatus.DRAFT, ListingStatus.PENDING_MODERATION, "owner")).toBe(true);
    expect(canTransitionListing(ListingStatus.DRAFT, ListingStatus.PUBLISHED, "owner")).toBe(false);
    expect(canTransitionListing(ListingStatus.DRAFT, ListingStatus.SOLD, "owner")).toBe(false);
    expect(canTransitionListing(ListingStatus.DRAFT, ListingStatus.RENTED, "owner")).toBe(false);
    expect(canTransitionListing(ListingStatus.PUBLISHED, ListingStatus.PAUSED, "owner")).toBe(true);
    expect(canTransitionListing(ListingStatus.PUBLISHED, ListingStatus.SOLD, "owner")).toBe(false);
  });

  it("lets moderation publish or reject, and lets transactions close a published listing", () => {
    expect(
      canTransitionListing(ListingStatus.PENDING_MODERATION, ListingStatus.PUBLISHED, "moderation"),
    ).toBe(true);
    expect(
      canTransitionListing(ListingStatus.PENDING_MODERATION, ListingStatus.REJECTED, "moderation"),
    ).toBe(true);
    expect(canTransitionListing(ListingStatus.PENDING_MODERATION, ListingStatus.SOLD, "moderation")).toBe(false);
    expect(canTransitionListing(ListingStatus.PUBLISHED, ListingStatus.SOLD, "transaction")).toBe(true);
    expect(canTransitionListing(ListingStatus.PUBLISHED, ListingStatus.RENTED, "transaction")).toBe(true);
    expect(canTransitionListing(ListingStatus.RENTED, ListingStatus.PUBLISHED, "transaction")).toBe(true);
    expect(canTransitionListing(ListingStatus.DRAFT, ListingStatus.PUBLISHED, "transaction")).toBe(false);
  });

  it("lets automatic review publish, hold, or reject a submission", () => {
    expect(canTransitionListing(ListingStatus.DRAFT, ListingStatus.PUBLISHED, "automation")).toBe(true);
    expect(canTransitionListing(ListingStatus.DRAFT, ListingStatus.PENDING_MODERATION, "automation")).toBe(true);
    expect(canTransitionListing(ListingStatus.DRAFT, ListingStatus.REJECTED, "automation")).toBe(true);
    expect(canTransitionListing(ListingStatus.DRAFT, ListingStatus.SOLD, "automation")).toBe(false);
    expect(canTransitionListing(ListingStatus.PUBLISHED, ListingStatus.REJECTED, "automation")).toBe(false);
    expect(canTransitionListing(ListingStatus.REJECTED, ListingStatus.PUBLISHED, "automation")).toBe(true);
  });
});
