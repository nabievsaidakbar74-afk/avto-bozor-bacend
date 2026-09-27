import { z } from "zod";
import { emailSchema, personNameSchema, phoneSchema } from "../../common/validation/identity.js";

const passwordSchema = z
  .string()
  .min(8, "Password must be 8 to 128 characters and include a letter and a number")
  .max(128, "Password must be 8 to 128 characters and include a letter and a number")
  .regex(/[A-Za-z]/, "Password must be 8 to 128 characters and include a letter and a number")
  .regex(/\d/, "Password must be 8 to 128 characters and include a letter and a number");

export const registerBodySchema = z.object({
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
  firstName: personNameSchema,
  lastName: personNameSchema,
});

export const loginBodySchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const authValidation = {
  register: registerBodySchema,
  login: loginBodySchema,
};
