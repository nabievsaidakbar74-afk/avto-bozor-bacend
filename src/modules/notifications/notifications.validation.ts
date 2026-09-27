import { z } from "zod";
import { paginationQuerySchema, uuidSchema } from "../../common/validation/pagination.js";

export const notificationIdParamSchema = z
  .object({
    id: uuidSchema,
  })
  .strict();

export const notificationListQuerySchema = paginationQuerySchema
  .extend({
    unread: z
      .enum(["true", "false"])
      .optional()
      .transform((value) => (value === undefined ? undefined : value === "true")),
  })
  .strict();

export const notificationsValidation = {
  idParam: notificationIdParamSchema,
  list: notificationListQuerySchema,
};
