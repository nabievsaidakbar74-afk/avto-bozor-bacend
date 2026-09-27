import { z } from "zod";

export const healthResponseSchema = z.object({
  success: z.literal(true),
  message: z.literal("API is healthy"),
});
