import { z } from "zod";
import { paginationQuerySchema, uuidSchema } from "../../common/validation/pagination.js";
import { analyticsPeriods } from "./admin-analytics.js";

const roleSchema = z.enum(["SUPER_ADMIN", "ADMIN", "MODERATOR", "USER"]);
const statusSchema = z.enum(["ACTIVE", "SUSPENDED", "BLOCKED", "PENDING"]);
const carStatuses = [
  "DRAFT",
  "PENDING_MODERATION",
  "AVAILABLE",
  "RESERVED",
  "SOLD",
  "RENTED",
  "INACTIVE",
  "REJECTED",
] as const;
const listingStatuses = [
  "DRAFT",
  "PENDING_MODERATION",
  "PUBLISHED",
  "REJECTED",
  "PAUSED",
  "SOLD",
  "RENTED",
  "EXPIRED",
] as const;
const listingTypes = ["SALE", "RENT"] as const;
const bookingStatuses = ["PENDING", "CONFIRMED", "ACTIVE", "COMPLETED", "CANCELLED", "REJECTED"] as const;

export const listUsersQuerySchema = paginationQuerySchema
  .extend({
    search: z.string().trim().min(1).max(100).optional(),
    role: roleSchema.optional(),
    status: statusSchema.optional(),
    sortBy: z
      .enum(["createdAt", "updatedAt", "email", "firstName", "lastName", "role", "status"])
      .default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict();

export const userIdParamSchema = z
  .object({
    id: uuidSchema,
  })
  .strict();

export const updateUserStatusSchema = z
  .object({
    status: statusSchema,
  })
  .strict();

export const analyticsQuerySchema = z
  .object({
    period: z.enum(analyticsPeriods).default("30d"),
  })
  .strict();

export const listCarsQuerySchema = paginationQuerySchema
  .extend({
    search: z.string().trim().min(1).max(100).optional(),
    brand: z.string().trim().min(1).max(80).optional(),
    status: z.enum(carStatuses).optional(),
    location: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export const listListingsQuerySchema = paginationQuerySchema
  .extend({
    status: z.enum(listingStatuses).optional(),
    type: z.enum(listingTypes).optional(),
    owner: uuidSchema.optional(),
  })
  .strict();

export const listBookingsQuerySchema = paginationQuerySchema
  .extend({
    status: z.enum(bookingStatuses).optional(),
  })
  .strict();

export const adminValidation = {
  listUsers: listUsersQuerySchema,
  userId: userIdParamSchema,
  updateStatus: updateUserStatusSchema,
  analytics: analyticsQuerySchema,
  listCars: listCarsQuerySchema,
  listListings: listListingsQuerySchema,
  listBookings: listBookingsQuerySchema,
};
