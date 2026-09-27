import { z } from "zod";
import { uuidSchema } from "../../common/validation/pagination.js";

export const salesValidation = {
  idParam: z.object({
    id: uuidSchema,
  }),
};
