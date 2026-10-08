import { CarStatus, ListingStatus, ListingType } from "@prisma/client";
import { AppError } from "../../common/errors/app-error.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import type { AuditMetadata } from "../audit/audit.service.js";

const CAR_NOT_FOUND = new AppError("Car not found", 404, "NOT_FOUND");

const MIN_IMAGES = 1;
const OPEN_LISTING_STATUSES = [
  ListingStatus.DRAFT,
  ListingStatus.PENDING_MODERATION,
  ListingStatus.PUBLISHED,
  ListingStatus.PAUSED,
] as const;

const PLACEHOLDER = /^(n\/?a|test|xxx+|unknown|none|brand|model|mashina|avto|car|-|\.+)$/i;
const PROHIBITED =
  /soxta\s+hujjat|firibgarlik|firibgar|scam|stolen\s+car|o['’]?g['’]?irlangan|fake\s+documents|money\s+laundering/i;
const SUSPICIOUS_CONTACT = /(https?:\/\/|www\.|t\.me\/|\btelegram\b|\bwhatsapp\b|@[a-z0-9._-]+\.[a-z]{2,}|\+\d{7,})/i;
const PHONE = /^\+[1-9]\d{7,14}$/;

const REQUIRED = "Majburiy ma'lumotlar to'liq emas";
const PRICE = "Narx noto'g'ri";
const IMAGE = "Rasm talabga javob bermaydi";
const RULES = "E'lon qoidalariga mos kelmaydi";
const SIMILAR = "Juda o'xshash e'lon topildi";
const PRICE_RANGE = "Narx odatiy oralig'dan tashqarida";

export type ListingModerationResult = {
  status: typeof ListingStatus.PUBLISHED | typeof ListingStatus.PENDING_MODERATION | typeof ListingStatus.REJECTED;
  reasons: string[];
};

export type ListingModerationSubject = {
  carId: string;
  ownerId: string;
  type: ListingType;
  title: string;
  description: string;
  salePrice: string | null;
  rentalDailyPrice: string | null;
  location?: string;
  expiresAt?: Date | null;
  excludeListingId?: string;
};

export type ListingModerationFacts = {
  type: ListingType;
  title: string;
  description: string;
  salePrice: string | null;
  rentalDailyPrice: string | null;
  brand: string;
  model: string;
  location: string;
  carStatus: CarStatus;
  carPrice: number;
  imageCount: number;
  ownerPhone: string;
  duplicateOpenListing: boolean;
  similarListing: boolean;
  expiresAt: Date | null;
};

function unique(reasons: string[]): string[] {
  return [...new Set(reasons)];
}

function money(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function blank(value: string): boolean {
  const text = value.trim();
  return text.length < 2 || PLACEHOLDER.test(text);
}

export function decideListingModeration(facts: ListingModerationFacts): ListingModerationResult {
  const rejected: string[] = [];
  const review: string[] = [];
  const text = `${facts.title}\n${facts.description}`;
  const salePrice = money(facts.salePrice);
  const dailyPrice = money(facts.rentalDailyPrice);

  if (facts.type !== ListingType.SALE && facts.type !== ListingType.RENT) {
    rejected.push(RULES);
  }
  if (blank(facts.brand) || blank(facts.model) || facts.location.trim().length === 0 || blank(facts.title)) {
    rejected.push(REQUIRED);
  }
  if (facts.description.trim().length === 0) {
    rejected.push(REQUIRED);
  }
  if (!PHONE.test(facts.ownerPhone)) {
    rejected.push(RULES);
  }
  if (facts.duplicateOpenListing || PROHIBITED.test(text)) {
    rejected.push(RULES);
  }
  if (
    facts.carStatus === CarStatus.SOLD ||
    facts.carStatus === CarStatus.INACTIVE ||
    facts.carStatus === CarStatus.REJECTED
  ) {
    rejected.push(RULES);
  }
  if (facts.expiresAt && facts.expiresAt.getTime() <= Date.now()) {
    rejected.push(RULES);
  }
  if (facts.imageCount < MIN_IMAGES) {
    rejected.push(IMAGE);
  }

  if (facts.type === ListingType.SALE) {
    if (salePrice === null || salePrice <= 0 || facts.carPrice <= 0) {
      rejected.push(PRICE);
    } else {
      const ratio = salePrice / facts.carPrice;
      if (ratio > 20 || ratio < 0.05) {
        rejected.push(PRICE);
      } else if (ratio > 3 || ratio < 0.4) {
        review.push(PRICE_RANGE);
      }
    }
  }

  if (facts.type === ListingType.RENT) {
    if (dailyPrice === null || dailyPrice <= 0 || facts.carPrice <= 0) {
      rejected.push(PRICE);
    } else if (dailyPrice >= facts.carPrice || dailyPrice < 1) {
      rejected.push(PRICE);
    } else if (dailyPrice > facts.carPrice * 0.2) {
      review.push(PRICE_RANGE);
    }
  }

  if (
    facts.carStatus === CarStatus.DRAFT ||
    facts.carStatus === CarStatus.PENDING_MODERATION ||
    facts.carStatus === CarStatus.RESERVED ||
    facts.carStatus === CarStatus.RENTED
  ) {
    review.push(RULES);
  }
  if (SUSPICIOUS_CONTACT.test(text)) {
    review.push(RULES);
  }
  if (facts.similarListing) {
    review.push(SIMILAR);
  }

  if (rejected.length > 0) {
    return { status: ListingStatus.REJECTED, reasons: unique(rejected) };
  }
  if (review.length > 0) {
    return { status: ListingStatus.PENDING_MODERATION, reasons: unique(review) };
  }
  return { status: ListingStatus.PUBLISHED, reasons: [] };
}

export function listingOutcomeMessage(moderation: ListingModerationResult | null, fallback: string): string {
  if (!moderation) {
    return fallback;
  }
  if (moderation.status === ListingStatus.PUBLISHED) {
    return "Listing published";
  }
  if (moderation.status === ListingStatus.REJECTED) {
    return `Listing rejected: ${moderation.reasons[0] ?? RULES}`;
  }
  return "Listing submitted for review";
}

export function rentalOutcomeMessage(moderation: ListingModerationResult): string {
  if (moderation.status === ListingStatus.PUBLISHED) {
    return "Rental published";
  }
  if (moderation.status === ListingStatus.REJECTED) {
    return `Rental rejected: ${moderation.reasons[0] ?? RULES}`;
  }
  return "Rental submitted for moderation";
}

export const listingModerationService = {
  async review(subject: ListingModerationSubject): Promise<ListingModerationResult> {
    const car = await PrismaService.client().car.findUnique({
      where: { id: subject.carId },
      select: {
        id: true,
        ownerId: true,
        brand: true,
        model: true,
        year: true,
        price: true,
        location: true,
        status: true,
        owner: { select: { phone: true } },
        _count: { select: { images: true } },
      },
    });
    if (!car || car.ownerId !== subject.ownerId) {
      throw CAR_NOT_FOUND;
    }

    const openListing = await PrismaService.client().listing.findFirst({
      where: {
        carId: car.id,
        type: subject.type,
        status: { in: [...OPEN_LISTING_STATUSES] },
        ...(subject.excludeListingId ? { id: { not: subject.excludeListingId } } : {}),
      },
      select: { id: true },
    });
    const similar = await PrismaService.client().listing.findFirst({
      where: {
        ownerId: subject.ownerId,
        type: subject.type,
        carId: { not: car.id },
        status: { in: [ListingStatus.PENDING_MODERATION, ListingStatus.PUBLISHED] },
        ...(subject.excludeListingId ? { id: { not: subject.excludeListingId } } : {}),
        car: { brand: car.brand, model: car.model, year: car.year },
      },
      select: { id: true },
    });

    return decideListingModeration({
      type: subject.type,
      title: subject.title,
      description: subject.description,
      salePrice: subject.salePrice,
      rentalDailyPrice: subject.rentalDailyPrice,
      brand: car.brand,
      model: car.model,
      location: subject.location ?? car.location,
      carStatus: car.status,
      carPrice: car.price.toNumber(),
      imageCount: car._count.images,
      ownerPhone: car.owner.phone,
      duplicateOpenListing: openListing !== null,
      similarListing: similar !== null,
      expiresAt: subject.expiresAt ?? null,
    });
  },
};

export function moderationAuditMetadata(moderation: ListingModerationResult | null): AuditMetadata | undefined {
  if (!moderation) {
    return undefined;
  }
  return {
    moderation: moderation.status,
    reasons: moderation.reasons.join("; "),
  };
}
