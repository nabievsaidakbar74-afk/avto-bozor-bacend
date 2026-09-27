import { z } from "zod";
import { paginationQuerySchema, uuidSchema } from "../../common/validation/pagination.js";

export const favoriteCarParamSchema = z
  .object({
    carId: uuidSchema,
  })
  .strict();

export const favoriteListQuerySchema = paginationQuerySchema.strict();

export const favoritesValidation = {
  carParam: favoriteCarParamSchema,
  list: favoriteListQuerySchema,
};
