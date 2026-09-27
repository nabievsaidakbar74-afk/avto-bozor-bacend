import { z } from "zod";
import { paginationQuerySchema, uuidSchema } from "../../common/validation/pagination.js";

const moneySchema = z
  .union([z.number(), z.string()])
  .transform((value) => (typeof value === "number" ? value.toString() : value.trim()))
  .pipe(z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/, "Enter a valid amount"))
  .refine((value) => Number(value) > 0, "Amount must be greater than 0");

const queryMoney = z.coerce.number().positive().finite().max(999_999_999_999.99);

const listingTypes = ["SALE", "RENT"] as const;
const listingStatuses = [
  "DRAFT",
  "PENDING_MODERATION",
  "PUBLISHED",
  "PAUSED",
  "SOLD",
  "RENTED",
  "REJECTED",
  "EXPIRED",
] as const;
export const listingSortFields = ["createdAt", "publishedAt", "title", "salePrice", "rentalDailyPrice"] as const;

const expiresAtSchema = z.iso.datetime();

function priceRules(
  value: { salePrice?: string; rentalDailyPrice?: string | null },
  ctx: z.RefinementCtx,
  type: "SALE" | "RENT",
): void {
  if (type === "SALE" && !value.salePrice) {
    ctx.addIssue({ code: "custom", path: ["salePrice"], message: "Sale listings require a sale price" });
  }
  if (type === "SALE" && value.rentalDailyPrice) {
    ctx.addIssue({
      code: "custom",
      path: ["rentalDailyPrice"],
      message: "Sale listings cannot include a rental price",
    });
  }
  if (type === "RENT" && !value.rentalDailyPrice) {
    ctx.addIssue({
      code: "custom",
      path: ["rentalDailyPrice"],
      message: "Rental listings require a daily price",
    });
  }
  if (type === "RENT" && value.salePrice) {
    ctx.addIssue({ code: "custom", path: ["salePrice"], message: "Rental listings cannot include a sale price" });
  }
}

export const createListingSchema = z
  .object({
    carId: uuidSchema,
    type: z.enum(listingTypes),
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(5000),
    salePrice: moneySchema.optional(),
    rentalDailyPrice: moneySchema.optional(),
    status: z.enum(["DRAFT", "PENDING_MODERATION"]).optional(),
    expiresAt: expiresAtSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    priceRules(value, ctx, value.type);
  });

export const updateListingSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().min(1).max(5000).optional(),
    salePrice: moneySchema.nullable().optional(),
    rentalDailyPrice: moneySchema.nullable().optional(),
    status: z.enum(listingStatuses).optional(),
    expiresAt: expiresAtSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Provide at least one listing field",
  });

export const listListingsQuerySchema = paginationQuerySchema
  .extend({
    search: z.string().trim().min(1).max(100).optional(),
    type: z.enum(listingTypes).optional(),
    brand: z.string().trim().min(1).max(80).optional(),
    model: z.string().trim().min(1).max(80).optional(),
    location: z.string().trim().min(1).max(120).optional(),
    minPrice: queryMoney.optional(),
    maxPrice: queryMoney.optional(),
    sortBy: z.enum(listingSortFields).default("publishedAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict()
  .refine((query) => query.minPrice === undefined || query.maxPrice === undefined || query.minPrice <= query.maxPrice, {
    message: "minPrice cannot be greater than maxPrice",
    path: ["minPrice"],
  });

export const myListingsQuerySchema = paginationQuerySchema
  .extend({
    status: z.enum(listingStatuses).optional(),
    sortBy: z.enum(["createdAt", "updatedAt"]).default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict();

export const listingIdParamSchema = z
  .object({
    id: uuidSchema,
  })
  .strict();

export const listingsValidation = {
  create: createListingSchema,
  update: updateListingSchema,
  list: listListingsQuerySchema,
  mine: myListingsQuerySchema,
  idParam: listingIdParamSchema,
};
