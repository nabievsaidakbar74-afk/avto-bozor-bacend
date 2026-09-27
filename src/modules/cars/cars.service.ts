import { CarStatus, Prisma } from "@prisma/client";
import { AppError } from "../../common/errors/app-error.js";
import { assertCanModifyCar, resolvePartyId } from "../../common/security/ownership.js";
import type { RoleName } from "../../common/security/roles.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import { AuditAction, auditService } from "../audit/audit.service.js";
import type { CarList, CreateCarInput, ListCarsQuery, PublicCar, UpdateCarInput } from "./cars.dto.js";
import { publicCarStatuses } from "./cars.validation.js";

const NOT_FOUND = new AppError("Car not found", 404, "NOT_FOUND");
const STATUS_LOCKED = new AppError(
  "This car status is controlled by a sale or rental",
  409,
  "CAR_STATUS_LOCKED",
);
const SYSTEM_CAR_STATUSES = new Set<CarStatus>([CarStatus.RESERVED, CarStatus.SOLD, CarStatus.RENTED]);

const publicCarSelect = {
  id: true,
  ownerId: true,
  brand: true,
  model: true,
  year: true,
  price: true,
  dailyRentalPrice: true,
  mileage: true,
  fuelType: true,
  transmission: true,
  bodyType: true,
  color: true,
  engine: true,
  description: true,
  location: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  images: {
    select: {
      id: true,
      url: true,
      sortOrder: true,
    },
    orderBy: {
      sortOrder: "asc",
    },
  },
  owner: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatar: true,
    },
  },
} satisfies Prisma.CarSelect;

type CarRecord = Prisma.CarGetPayload<{ select: typeof publicCarSelect }>;

type CarViewer = {
  id: string;
  role: RoleName;
};

function money(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

function toPublicCar(car: CarRecord): PublicCar {
  return {
    id: car.id,
    ownerId: car.ownerId,
    brand: car.brand,
    model: car.model,
    year: car.year,
    price: money(car.price),
    dailyRentalPrice: car.dailyRentalPrice ? money(car.dailyRentalPrice) : null,
    mileage: car.mileage,
    fuelType: car.fuelType,
    transmission: car.transmission,
    bodyType: car.bodyType,
    color: car.color,
    engine: car.engine,
    description: car.description,
    location: car.location,
    status: car.status,
    createdAt: car.createdAt,
    updatedAt: car.updatedAt,
    images: car.images,
    owner: car.owner,
  };
}

function isPublicStatus(status: CarStatus): boolean {
  return (publicCarStatuses as readonly CarStatus[]).includes(status);
}

function canViewPrivateCar(viewer: CarViewer | undefined, car: { ownerId: string }): boolean {
  if (!viewer) {
    return false;
  }
  return viewer.id === car.ownerId || viewer.role === "ADMIN" || viewer.role === "SUPER_ADMIN";
}

function carOrderBy(
  sortBy: ListCarsQuery["sortBy"],
  sortOrder: ListCarsQuery["sortOrder"],
): Prisma.CarOrderByWithRelationInput {
  switch (sortBy) {
    case "price":
      return { price: sortOrder };
    case "year":
      return { year: sortOrder };
    case "mileage":
      return { mileage: sortOrder };
    case "brand":
      return { brand: sortOrder };
    case "model":
      return { model: sortOrder };
    case "createdAt":
      return { createdAt: sortOrder };
  }
}

function priceFilter(query: ListCarsQuery): Prisma.DecimalFilter | undefined {
  if (query.minPrice === undefined && query.maxPrice === undefined) {
    return undefined;
  }
  const filter: Prisma.DecimalFilter = {};
  if (query.minPrice !== undefined) {
    filter.gte = new Prisma.Decimal(query.minPrice.toFixed(2));
  }
  if (query.maxPrice !== undefined) {
    filter.lte = new Prisma.Decimal(query.maxPrice.toFixed(2));
  }
  return filter;
}

function listWhere(query: ListCarsQuery): Prisma.CarWhereInput {
  const where: Prisma.CarWhereInput = {
    status: query.status ?? { in: [...publicCarStatuses] },
  };
  const price = priceFilter(query);
  if (price) {
    where.price = price;
  }
  if (query.brand) {
    where.brand = { equals: query.brand, mode: "insensitive" };
  }
  if (query.model) {
    where.model = { equals: query.model, mode: "insensitive" };
  }
  if (query.location) {
    where.location = { equals: query.location, mode: "insensitive" };
  }
  if (query.fuelType) {
    where.fuelType = query.fuelType;
  }
  if (query.transmission) {
    where.transmission = query.transmission;
  }
  if (query.bodyType) {
    where.bodyType = query.bodyType;
  }
  if (query.minYear !== undefined || query.maxYear !== undefined) {
    where.year = {
      ...(query.minYear !== undefined ? { gte: query.minYear } : {}),
      ...(query.maxYear !== undefined ? { lte: query.maxYear } : {}),
    };
  }
  if (query.minMileage !== undefined || query.maxMileage !== undefined) {
    where.mileage = {
      ...(query.minMileage !== undefined ? { gte: query.minMileage } : {}),
      ...(query.maxMileage !== undefined ? { lte: query.maxMileage } : {}),
    };
  }
  if (query.search) {
    where.OR = [
      { brand: { contains: query.search, mode: "insensitive" } },
      { model: { contains: query.search, mode: "insensitive" } },
      { location: { contains: query.search, mode: "insensitive" } },
      { description: { contains: query.search, mode: "insensitive" } },
    ];
  }
  return where;
}

function updateData(input: UpdateCarInput): Prisma.CarUpdateInput {
  const data: Prisma.CarUpdateInput = {};
  if (input.brand !== undefined) {
    data.brand = input.brand;
  }
  if (input.model !== undefined) {
    data.model = input.model;
  }
  if (input.year !== undefined) {
    data.year = input.year;
  }
  if (input.price !== undefined) {
    data.price = input.price;
  }
  if (input.dailyRentalPrice !== undefined) {
    data.dailyRentalPrice = input.dailyRentalPrice;
  }
  if (input.mileage !== undefined) {
    data.mileage = input.mileage;
  }
  if (input.fuelType !== undefined) {
    data.fuelType = input.fuelType;
  }
  if (input.transmission !== undefined) {
    data.transmission = input.transmission;
  }
  if (input.bodyType !== undefined) {
    data.bodyType = input.bodyType;
  }
  if (input.color !== undefined) {
    data.color = input.color;
  }
  if (input.engine !== undefined) {
    data.engine = input.engine;
  }
  if (input.description !== undefined) {
    data.description = input.description;
  }
  if (input.location !== undefined) {
    data.location = input.location;
  }
  if (input.status !== undefined) {
    data.status = input.status;
  }
  return data;
}

async function findCar(id: string): Promise<CarRecord> {
  const car = await PrismaService.client().car.findUnique({
    where: { id },
    select: publicCarSelect,
  });
  if (!car) {
    throw NOT_FOUND;
  }
  return car;
}

export const carsService = {
  async list(query: ListCarsQuery): Promise<CarList> {
    const where = listWhere(query);
    const [total, cars] = await PrismaService.client().$transaction([
      PrismaService.client().car.count({ where }),
      PrismaService.client().car.findMany({
        where,
        select: publicCarSelect,
        orderBy: carOrderBy(query.sortBy, query.sortOrder),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);

    return {
      cars: cars.map(toPublicCar),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
      },
    };
  },

  async getById(id: string, viewer?: CarViewer): Promise<PublicCar> {
    const car = await findCar(id);
    if (!isPublicStatus(car.status) && !canViewPrivateCar(viewer, car)) {
      throw NOT_FOUND;
    }
    return toPublicCar(car);
  },

  async create(actorId: string, input: CreateCarInput): Promise<PublicCar> {
    const car = await PrismaService.client().car.create({
      data: {
        ownerId: resolvePartyId(actorId),
        brand: input.brand,
        model: input.model,
        year: input.year,
        price: input.price,
        dailyRentalPrice: input.dailyRentalPrice ?? null,
        mileage: input.mileage,
        fuelType: input.fuelType,
        transmission: input.transmission,
        bodyType: input.bodyType,
        color: input.color,
        engine: input.engine,
        description: input.description,
        location: input.location,
        status: input.status ?? CarStatus.DRAFT,
      },
      select: publicCarSelect,
    });
    await auditService.persist({
      actorId: car.ownerId,
      action: AuditAction.CAR_CREATED,
      resource: "car",
      resourceId: car.id,
    });
    return toPublicCar(car);
  },

  async update(actor: CarViewer, id: string, input: UpdateCarInput): Promise<PublicCar> {
    const existing = await findCar(id);
    assertCanModifyCar(actor.id, actor.role, existing.ownerId);
    if (input.status !== undefined && SYSTEM_CAR_STATUSES.has(existing.status)) {
      throw STATUS_LOCKED;
    }
    const car = await PrismaService.client().car.update({
      where: { id: existing.id },
      data: updateData(input),
      select: publicCarSelect,
    });
    await auditService.persist({
      actorId: actor.id,
      action: AuditAction.CAR_UPDATED,
      resource: "car",
      resourceId: car.id,
    });
    return toPublicCar(car);
  },

  async deactivate(actor: CarViewer, id: string): Promise<PublicCar> {
    const existing = await findCar(id);
    assertCanModifyCar(actor.id, actor.role, existing.ownerId);
    if (existing.status === CarStatus.INACTIVE) {
      return toPublicCar(existing);
    }

    const car = await PrismaService.client().car.update({
      where: { id: existing.id },
      data: { status: CarStatus.INACTIVE },
      select: publicCarSelect,
    });
    await auditService.persist({
      actorId: actor.id,
      action: AuditAction.CAR_DELETED,
      resource: "car",
      resourceId: car.id,
      metadata: { status: CarStatus.INACTIVE },
    });
    return toPublicCar(car);
  },
};
