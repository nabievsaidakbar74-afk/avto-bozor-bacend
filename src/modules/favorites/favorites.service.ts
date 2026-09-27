import { CarStatus, Prisma } from "@prisma/client";
import { AppError } from "../../common/errors/app-error.js";
import { resolvePartyId } from "../../common/security/ownership.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import { publicCarStatuses } from "../cars/cars.validation.js";
import type { FavoriteList, FavoriteListQuery, FavoriteView } from "./favorites.dto.js";

const NOT_FOUND = new AppError("Favorite not found", 404, "NOT_FOUND");
const DUPLICATE = new AppError("This car is already in your favorites", 409, "DUPLICATE_FAVORITE");

const favoriteSelect = {
  id: true,
  carId: true,
  createdAt: true,
  car: {
    select: {
      id: true,
      brand: true,
      model: true,
      year: true,
      price: true,
      location: true,
      status: true,
    },
  },
} satisfies Prisma.FavoriteSelect;

type FavoriteRecord = Prisma.FavoriteGetPayload<{ select: typeof favoriteSelect }>;

function toView(favorite: FavoriteRecord): FavoriteView {
  return {
    id: favorite.id,
    carId: favorite.carId,
    createdAt: favorite.createdAt,
    car: {
      id: favorite.car.id,
      brand: favorite.car.brand,
      model: favorite.car.model,
      year: favorite.car.year,
      price: favorite.car.price.toFixed(2),
      location: favorite.car.location,
      status: favorite.car.status,
    },
  };
}

function isVisibleCar(status: CarStatus): boolean {
  return (publicCarStatuses as readonly CarStatus[]).includes(status);
}

export const favoritesService = {
  async add(actorId: string, carId: string): Promise<FavoriteView> {
    const userId = resolvePartyId(actorId);
    const car = await PrismaService.client().car.findUnique({
      where: { id: carId },
      select: { id: true, status: true, ownerId: true },
    });
    if (!car || (!isVisibleCar(car.status) && car.ownerId !== userId)) {
      throw NOT_FOUND;
    }

    try {
      const favorite = await PrismaService.client().favorite.create({
        data: { userId, carId: car.id },
        select: favoriteSelect,
      });
      return toView(favorite);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw DUPLICATE;
      }
      throw error;
    }
  },

  async remove(actorId: string, carId: string): Promise<void> {
    const userId = resolvePartyId(actorId);
    const removed = await PrismaService.client().favorite.deleteMany({
      where: { userId, carId },
    });
    if (removed.count === 0) {
      throw NOT_FOUND;
    }
  },

  async list(actorId: string, query: FavoriteListQuery): Promise<FavoriteList> {
    const userId = resolvePartyId(actorId);
    const where = { userId };
    const [total, favorites] = await PrismaService.client().$transaction([
      PrismaService.client().favorite.count({ where }),
      PrismaService.client().favorite.findMany({
        where,
        select: favoriteSelect,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return {
      favorites: favorites.map(toView),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
      },
    };
  },
};
