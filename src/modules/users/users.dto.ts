import type { z } from "zod";
import type { updateProfileSchema } from "./users.validation.js";

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
