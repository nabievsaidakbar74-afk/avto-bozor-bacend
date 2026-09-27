import type { z } from "zod";
import type { publishRentalSchema } from "./rentals.validation.js";

export type PublishRentalInput = z.infer<typeof publishRentalSchema>;
