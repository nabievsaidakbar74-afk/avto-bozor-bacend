import type { CarStatus } from "@prisma/client";
import type { z } from "zod";
import type { carIdParamSchema, createCarSchema, listCarsQuerySchema, updateCarSchema } from "./cars.validation.js";

export type CreateCarInput = z.infer<typeof createCarSchema>;
export type UpdateCarInput = z.infer<typeof updateCarSchema>;
export type ListCarsQuery = z.infer<typeof listCarsQuerySchema>;
export type CarIdParams = z.infer<typeof carIdParamSchema>;

export type PublicCarOwner = {
  id: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
};

export type PublicCarImage = {
  id: string;
  url: string;
  sortOrder: number;
};

export type PublicCar = {
  id: string;
  ownerId: string;
  brand: string;
  model: string;
  year: number;
  price: string;
  dailyRentalPrice: string | null;
  mileage: number;
  fuelType: CreateCarInput["fuelType"];
  transmission: CreateCarInput["transmission"];
  bodyType: CreateCarInput["bodyType"];
  color: string;
  engine: string;
  description: string;
  location: string;
  status: CarStatus;
  createdAt: Date;
  updatedAt: Date;
  images: PublicCarImage[];
  owner: PublicCarOwner;
};

export type CarList = {
  cars: PublicCar[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};
