import { z } from "zod";
import { paginationQuerySchema, uuidSchema } from "../../common/validation/pagination.js";
import { parseBookingDate } from "./booking-dates.js";

const bookingDate = z.string().trim().refine((value) => parseBookingDate(value) !== null, {
  message: "Enter a valid date as YYYY-MM-DD",
});

export const createBookingSchema = z
  .object({
    carId: uuidSchema,
    startDate: bookingDate,
    endDate: bookingDate,
  })
  .strict()
  .refine((value) => {
    const start = parseBookingDate(value.startDate);
    const end = parseBookingDate(value.endDate);
    return start !== null && end !== null && start < end;
  }, {
    message: "endDate must be after startDate",
    path: ["endDate"],
  });

export const bookingIdParamSchema = z
  .object({
    id: uuidSchema,
  })
  .strict();

export const bookingListQuerySchema = paginationQuerySchema
  .extend({
    sortBy: z.enum(["createdAt", "startDate"]).default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict();

export const bookingsValidation = {
  create: createBookingSchema,
  idParam: bookingIdParamSchema,
  list: bookingListQuerySchema,
};
