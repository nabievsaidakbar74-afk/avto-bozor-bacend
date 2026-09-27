import { z } from "zod";
import { uuidSchema } from "../../common/validation/pagination.js";
import { parseBookingDate } from "../bookings/booking-dates.js";

const moneySchema = z
  .union([z.number(), z.string()])
  .transform((value) => (typeof value === "number" ? value.toString() : value.trim()))
  .pipe(z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/, "Enter a valid amount"))
  .refine((value) => Number(value) > 0, "Amount must be greater than 0");

const daySchema = z.string().trim().refine((value) => parseBookingDate(value) !== null, {
  message: "Enter a valid date as YYYY-MM-DD",
});

export const publishRentalSchema = z
  .object({
    carId: uuidSchema,
    description: z.string().trim().min(1).max(5000),
    dailyPrice: moneySchema,
    location: z.string().trim().min(1).max(120).optional(),
    availableUntil: daySchema.optional(),
  })
  .strict();

export const rentalsValidation = {
  publish: publishRentalSchema,
};
