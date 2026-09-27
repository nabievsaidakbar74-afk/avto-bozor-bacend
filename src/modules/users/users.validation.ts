import { z } from "zod";
import { emailSchema, personNameSchema, phoneSchema } from "../../common/validation/identity.js";

const avatarSchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .regex(/^(?:https:\/\/[^\s]+|\/uploads\/[A-Za-z0-9/_.-]+)$/, "Avatar must be an https URL or an uploaded image path")
  .nullable();

export const updateProfileSchema = z
  .object({
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    firstName: personNameSchema.optional(),
    lastName: personNameSchema.optional(),
    avatar: avatarSchema.optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Provide at least one profile field",
  });

export const usersValidation = {
  updateProfile: updateProfileSchema,
};
