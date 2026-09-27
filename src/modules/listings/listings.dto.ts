import type { ListingStatus, ListingType } from "@prisma/client";
import type { z } from "zod";
import type {
  createListingSchema,
  listListingsQuerySchema,
  listingIdParamSchema,
  myListingsQuerySchema,
  updateListingSchema,
} from "./listings.validation.js";

export type CreateListingInput = z.infer<typeof createListingSchema>;
export type UpdateListingInput = z.infer<typeof updateListingSchema>;
export type ListListingsQuery = z.infer<typeof listListingsQuerySchema>;
export type MyListingsQuery = z.infer<typeof myListingsQuerySchema>;
export type ListingIdParams = z.infer<typeof listingIdParamSchema>;

export type PublicListing = {
  id: string;
  carId: string;
  ownerId: string;
  type: ListingType;
  status: ListingStatus;
  salePrice: string | null;
  rentalDailyPrice: string | null;
  title: string;
  description: string;
  publishedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  car: {
    id: string;
    brand: string;
    model: string;
    year: number;
    location: string;
    price: string;
    images: Array<{ id: string; url: string; sortOrder: number }>;
  };
  owner: {
    id: string;
    firstName: string;
    lastName: string;
    avatar: string | null;
  };
};

export type ListingList = {
  listings: PublicListing[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};
