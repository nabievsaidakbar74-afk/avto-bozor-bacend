import { z } from "zod";
import { paginationQuerySchema, uuidSchema } from "../../common/validation/pagination.js";

export const pendingListingsQuerySchema = paginationQuerySchema
  .extend({
    sortBy: z.enum(["createdAt"]).default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("asc"),
  })
  .strict();

export const rejectListingSchema = z
  .object({
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export const listingIdParamSchema = z
  .object({
    id: uuidSchema,
  })
  .strict();

export const moderationValidation = {
  pending: pendingListingsQuerySchema,
  reject: rejectListingSchema,
  idParam: listingIdParamSchema,
};
