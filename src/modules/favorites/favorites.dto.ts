import type { CarStatus } from "@prisma/client";
import type { z } from "zod";
import type { favoriteCarParamSchema, favoriteListQuerySchema } from "./favorites.validation.js";

export type FavoriteCarParams = z.infer<typeof favoriteCarParamSchema>;
export type FavoriteListQuery = z.infer<typeof favoriteListQuerySchema>;

export type FavoriteView = {
  id: string;
  carId: string;
  createdAt: Date;
  car: {
    id: string;
    brand: string;
    model: string;
    year: number;
    price: string;
    location: string;
    status: CarStatus;
  };
};

export type FavoriteList = {
  favorites: FavoriteView[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};
