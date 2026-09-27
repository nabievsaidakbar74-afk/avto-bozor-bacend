import { z } from "zod";
import { paginationQuerySchema, uuidSchema } from "../../common/validation/pagination.js";

const paymentStatuses = ["PENDING", "PROCESSING", "PAID", "FAILED", "CANCELLED", "REFUNDED"] as const;

export const createPaymentSchema = z
  .object({
    purchaseId: uuidSchema.optional(),
    bookingId: uuidSchema.optional(),
  })
  .strict()
  .refine((value) => (value.purchaseId ? 1 : 0) + (value.bookingId ? 1 : 0) === 1, {
    message: "Provide either a purchase or a booking",
    path: ["purchaseId"],
  });

export const paymentIdParamSchema = z
  .object({
    id: uuidSchema,
  })
  .strict();

export const paymentListQuerySchema = paginationQuerySchema
  .extend({
    status: z.enum(paymentStatuses).optional(),
  })
  .strict();

export const paymentsValidation = {
  create: createPaymentSchema,
  idParam: paymentIdParamSchema,
  list: paymentListQuerySchema,
};
