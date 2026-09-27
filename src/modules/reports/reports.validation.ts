import { z } from "zod";
import { paginationQuerySchema, uuidSchema } from "../../common/validation/pagination.js";

const reportStatuses = ["OPEN", "IN_REVIEW", "RESOLVED", "REJECTED"] as const;

export const createReportSchema = z
  .object({
    reason: z.string().trim().min(3).max(120),
    description: z.string().trim().min(1).max(5000),
    carId: uuidSchema.optional(),
    listingId: uuidSchema.optional(),
    userId: uuidSchema.optional(),
    reviewId: uuidSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      [value.carId, value.listingId, value.userId, value.reviewId].filter((item) => item !== undefined).length === 1,
    {
      message: "Report one car, listing, user, or review",
      path: ["carId"],
    },
  );

export const updateReportSchema = z
  .object({
    status: z.enum(reportStatuses),
  })
  .strict();

export const reportIdParamSchema = z
  .object({
    id: uuidSchema,
  })
  .strict();

export const reportListQuerySchema = paginationQuerySchema
  .extend({
    status: z.enum(reportStatuses).optional(),
  })
  .strict();

export const reportsValidation = {
  create: createReportSchema,
  update: updateReportSchema,
  idParam: reportIdParamSchema,
  list: reportListQuerySchema,
};
