import { Prisma } from "@prisma/client";
import type { PublicListing } from "./listings.dto.js";

export const listingSelect = {
  id: true,
  carId: true,
  ownerId: true,
  type: true,
  status: true,
  salePrice: true,
  rentalDailyPrice: true,
  title: true,
  description: true,
  publishedAt: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
  car: {
    select: {
      id: true,
      brand: true,
      model: true,
      year: true,
      location: true,
      price: true,
      images: {
        select: { id: true, url: true, sortOrder: true },
        orderBy: { sortOrder: "asc" as const },
      },
    },
  },
  owner: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatar: true,
    },
  },
} satisfies Prisma.ListingSelect;

export type ListingRecord = Prisma.ListingGetPayload<{ select: typeof listingSelect }>;

function money(value: Prisma.Decimal | null): string | null {
  return value ? value.toFixed(2) : null;
}

export function toPublicListing(listing: ListingRecord): PublicListing {
  return {
    id: listing.id,
    carId: listing.carId,
    ownerId: listing.ownerId,
    type: listing.type,
    status: listing.status,
    salePrice: money(listing.salePrice),
    rentalDailyPrice: money(listing.rentalDailyPrice),
    title: listing.title,
    description: listing.description,
    publishedAt: listing.publishedAt,
    expiresAt: listing.expiresAt,
    createdAt: listing.createdAt,
    updatedAt: listing.updatedAt,
    car: {
      id: listing.car.id,
      brand: listing.car.brand,
      model: listing.car.model,
      year: listing.car.year,
      location: listing.car.location,
      price: money(listing.car.price) ?? "0.00",
      images: listing.car.images,
    },
    owner: listing.owner,
  };
}
