import { CarStatus, ListingStatus, ListingType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  decideListingModeration,
  type ListingModerationFacts,
} from "../../src/modules/listings/listing-moderation.service.js";

function facts(overrides: Partial<ListingModerationFacts> = {}): ListingModerationFacts {
  return {
    type: ListingType.SALE,
    title: "Chevrolet Cobalt 2022",
    description: "Clean family car with service history.",
    salePrice: "18000.00",
    rentalDailyPrice: null,
    brand: "Chevrolet",
    model: "Cobalt",
    location: "Tashkent",
    carStatus: CarStatus.AVAILABLE,
    carPrice: 18000,
    imageCount: 1,
    ownerPhone: "+998901234567",
    duplicateOpenListing: false,
    similarListing: false,
    expiresAt: null,
    ...overrides,
  };
}

describe("automatic listing moderation", () => {
  it("publishes a complete listing", () => {
    expect(decideListingModeration(facts())).toEqual({ status: ListingStatus.PUBLISHED, reasons: [] });
  });

  it("rejects a listing without a usable photo", () => {
    const decision = decideListingModeration(facts({ imageCount: 0 }));
    expect(decision.status).toBe(ListingStatus.REJECTED);
    expect(decision.reasons).toContain("Rasm talabga javob bermaydi");
  });

  it("rejects an illogical price and incomplete car identity", () => {
    const decision = decideListingModeration(
      facts({ brand: "test", salePrice: "1.00", carPrice: 18000 }),
    );
    expect(decision.status).toBe(ListingStatus.REJECTED);
    expect(decision.reasons).toContain("Majburiy ma'lumotlar to'liq emas");
    expect(decision.reasons).toContain("Narx noto'g'ri");
  });

  it("rejects prohibited text, a bad phone, and a duplicate", () => {
    const decision = decideListingModeration(
      facts({
        description: "soxta hujjat bilan beriladi",
        ownerPhone: "901234567",
        duplicateOpenListing: true,
      }),
    );
    expect(decision.status).toBe(ListingStatus.REJECTED);
    expect(decision.reasons).toEqual(["E'lon qoidalariga mos kelmaydi"]);
  });

  it("holds a suspicious contact or an unusual price for review", () => {
    const contact = decideListingModeration(facts({ description: "Write on telegram @seller" }));
    expect(contact.status).toBe(ListingStatus.PENDING_MODERATION);
    expect(contact.reasons).toContain("E'lon qoidalariga mos kelmaydi");

    const price = decideListingModeration(facts({ type: ListingType.RENT, salePrice: null, rentalDailyPrice: "5000.00" }));
    expect(price.status).toBe(ListingStatus.PENDING_MODERATION);
    expect(price.reasons).toContain("Narx odatiy oralig'dan tashqarida");
  });

  it("holds a very similar open listing", () => {
    const decision = decideListingModeration(facts({ similarListing: true }));
    expect(decision).toEqual({
      status: ListingStatus.PENDING_MODERATION,
      reasons: ["Juda o'xshash e'lon topildi"],
    });
  });
});
