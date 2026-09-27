import { z } from "zod";
import { paginationQuerySchema, uuidSchema } from "../../common/validation/pagination.js";

const purchaseStatuses = ["PENDING", "CONFIRMED", "PAID", "COMPLETED", "CANCELLED", "REFUNDED"] as const;

export const createPurchaseSchema = z
  .object({
    carId: uuidSchema,
  })
  .strict();

export const purchaseIdParamSchema = z
  .object({
    id: uuidSchema,
  })
  .strict();

export const updatePurchaseStatusSchema = z
  .object({
    status: z.enum(purchaseStatuses),
  })
  .strict();

export const purchaseListQuerySchema = paginationQuerySchema
  .extend({
    status: z.enum(purchaseStatuses).optional(),
    sortBy: z.enum(["createdAt", "price"]).default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict();

export const purchasesValidation = {
  create: createPurchaseSchema,
  idParam: purchaseIdParamSchema,
  updateStatus: updatePurchaseStatusSchema,
  list: purchaseListQuerySchema,
};
