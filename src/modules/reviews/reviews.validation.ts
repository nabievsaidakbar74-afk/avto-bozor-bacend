import { z } from "zod";
import { paginationQuerySchema, uuidSchema } from "../../common/validation/pagination.js";

export const createReviewSchema = z
  .object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().min(1).max(2000),
    purchaseId: uuidSchema.optional(),
    bookingId: uuidSchema.optional(),
  })
  .strict()
  .refine((value) => (value.purchaseId ? 1 : 0) + (value.bookingId ? 1 : 0) === 1, {
    message: "Provide either a purchase or a booking",
    path: ["purchaseId"],
  });

export const reviewCarParamSchema = z
  .object({
    carId: uuidSchema,
  })
  .strict();

export const reviewListQuerySchema = paginationQuerySchema.strict();

export const reviewsValidation = {
  create: createReviewSchema,
  carParam: reviewCarParamSchema,
  list: reviewListQuerySchema,
};
