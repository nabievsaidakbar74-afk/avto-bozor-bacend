import type { z } from "zod";
import { salesValidation } from "./sales.validation.js";

export type SalesIdParams = z.infer<typeof salesValidation.idParam>;
