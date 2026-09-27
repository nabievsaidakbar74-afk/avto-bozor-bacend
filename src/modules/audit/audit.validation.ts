import { z } from "zod";
import { paginationQuerySchema, uuidSchema } from "../../common/validation/pagination.js";
import { AuditAction } from "./audit.service.js";

const actions = [
  AuditAction.LOGIN,
  AuditAction.LOGOUT,
  AuditAction.USER_CREATED,
  AuditAction.USER_UPDATED,
  AuditAction.USER_BLOCKED,
  AuditAction.CAR_CREATED,
  AuditAction.CAR_UPDATED,
  AuditAction.CAR_DELETED,
  AuditAction.LISTING_CREATED,
  AuditAction.LISTING_APPROVED,
  AuditAction.LISTING_REJECTED,
  AuditAction.PURCHASE_CREATED,
  AuditAction.BOOKING_CREATED,
  AuditAction.BOOKING_CONFIRMED,
  AuditAction.BOOKING_CANCELLED,
  AuditAction.PAYMENT_UPDATED,
  AuditAction.ADMIN_ACTION,
] as const;

export const auditListQuerySchema = paginationQuerySchema
  .extend({
    actor: uuidSchema.optional(),
    action: z.enum(actions).optional(),
    resource: z.string().trim().min(1).max(80).optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "from must be before to",
    path: ["to"],
  });

export const auditValidation = {
  list: auditListQuerySchema,
};
