import { z } from "zod";
import { paginationQuerySchema, uuidSchema } from "../../common/validation/pagination.js";

const currentYear = new Date().getFullYear();

const moneySchema = z
  .union([z.number(), z.string()])
  .transform((value) => (typeof value === "number" ? value.toString() : value.trim()))
  .pipe(z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/, "Enter a valid amount"))
  .refine((value) => Number(value) > 0, "Amount must be greater than 0");

const yearSchema = z.number().int().min(1950).max(currentYear + 1);
const mileageSchema = z.number().int().min(0).max(2_000_000);

export const fuelTypes = ["PETROL", "DIESEL", "GAS", "HYBRID", "ELECTRIC"] as const;
export const transmissions = ["MANUAL", "AUTOMATIC"] as const;
export const bodyTypes = [
  "SEDAN",
  "HATCHBACK",
  "SUV",
  "COUPE",
  "WAGON",
  "MINIVAN",
  "PICKUP",
  "VAN",
  "CONVERTIBLE",
] as const;
export const clientCarStatuses = ["DRAFT", "PENDING_MODERATION", "AVAILABLE", "INACTIVE"] as const;
export const publicCarStatuses = ["AVAILABLE", "RESERVED", "SOLD", "RENTED"] as const;
export const carSortFields = ["createdAt", "price", "year", "mileage", "brand", "model"] as const;

const carFields = {
  brand: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(80),
  year: yearSchema,
  price: moneySchema,
  dailyRentalPrice: moneySchema.nullable().optional(),
  mileage: mileageSchema,
  fuelType: z.enum(fuelTypes),
  transmission: z.enum(transmissions),
  bodyType: z.enum(bodyTypes),
  color: z.string().trim().min(1).max(40),
  engine: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(5000),
  location: z.string().trim().min(1).max(120),
  status: z.enum(clientCarStatuses).optional(),
};

export const createCarSchema = z.object(carFields).strict();

export const updateCarSchema = z
  .object({
    brand: carFields.brand.optional(),
    model: carFields.model.optional(),
    year: carFields.year.optional(),
    price: carFields.price.optional(),
    dailyRentalPrice: carFields.dailyRentalPrice,
    mileage: carFields.mileage.optional(),
    fuelType: carFields.fuelType.optional(),
    transmission: carFields.transmission.optional(),
    bodyType: carFields.bodyType.optional(),
    color: carFields.color.optional(),
    engine: carFields.engine.optional(),
    description: carFields.description.optional(),
    location: carFields.location.optional(),
    status: carFields.status,
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Provide at least one car field",
  });

const queryMoney = z.coerce.number().positive().finite().max(999_999_999_999.99);
const queryYear = z.coerce.number().int().min(1950).max(currentYear + 1);
const queryMileage = z.coerce.number().int().min(0).max(2_000_000);

export const listCarsQuerySchema = paginationQuerySchema
  .extend({
    search: z.string().trim().min(1).max(100).optional(),
    brand: z.string().trim().min(1).max(80).optional(),
    model: z.string().trim().min(1).max(80).optional(),
    minPrice: queryMoney.optional(),
    maxPrice: queryMoney.optional(),
    minYear: queryYear.optional(),
    maxYear: queryYear.optional(),
    fuelType: z.enum(fuelTypes).optional(),
    transmission: z.enum(transmissions).optional(),
    bodyType: z.enum(bodyTypes).optional(),
    minMileage: queryMileage.optional(),
    maxMileage: queryMileage.optional(),
    location: z.string().trim().min(1).max(120).optional(),
    status: z.enum(publicCarStatuses).optional(),
    sortBy: z.enum(carSortFields).default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict()
  .refine((query) => query.minPrice === undefined || query.maxPrice === undefined || query.minPrice <= query.maxPrice, {
    message: "minPrice cannot be greater than maxPrice",
    path: ["minPrice"],
  })
  .refine((query) => query.minYear === undefined || query.maxYear === undefined || query.minYear <= query.maxYear, {
    message: "minYear cannot be greater than maxYear",
    path: ["minYear"],
  })
  .refine(
    (query) =>
      query.minMileage === undefined ||
      query.maxMileage === undefined ||
      query.minMileage <= query.maxMileage,
    {
      message: "minMileage cannot be greater than maxMileage",
      path: ["minMileage"],
    },
  );

export const carIdParamSchema = z
  .object({
    id: uuidSchema,
  })
  .strict();

export const carImageParamsSchema = z
  .object({
    carId: uuidSchema,
  })
  .strict();

export const deleteCarImageParamsSchema = z
  .object({
    carId: uuidSchema,
    imageId: uuidSchema,
  })
  .strict();

export const reorderCarImagesSchema = z
  .object({
    imageIds: z.array(uuidSchema).min(1).max(10),
  })
  .strict()
  .refine((body) => new Set(body.imageIds).size === body.imageIds.length, {
    message: "imageIds must be unique",
    path: ["imageIds"],
  });

export const carsValidation = {
  create: createCarSchema,
  update: updateCarSchema,
  list: listCarsQuerySchema,
  idParam: carIdParamSchema,
  imageParams: carImageParamsSchema,
  deleteImageParams: deleteCarImageParamsSchema,
  reorderImages: reorderCarImagesSchema,
};
