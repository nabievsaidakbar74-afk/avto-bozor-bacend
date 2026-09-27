import { ListingStatus, ListingType, NotificationType, Prisma } from "@prisma/client";
import { AppError } from "../../common/errors/app-error.js";
import { assertCanModifyListing, resolvePartyId } from "../../common/security/ownership.js";
import type { RoleName } from "../../common/security/roles.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import { writeNotifications } from "../notifications/notifications.service.js";
import { AuditAction, auditService } from "../audit/audit.service.js";
import type {
  CreateListingInput,
  ListingList,
  ListListingsQuery,
  MyListingsQuery,
  PublicListing,
  UpdateListingInput,
} from "./listings.dto.js";
import { assertListingTransition } from "./listing-status.js";
import { listingSelect, toPublicListing, type ListingRecord } from "./listings.presenter.js";

const NOT_FOUND = new AppError("Listing not found", 404, "NOT_FOUND");
const CAR_NOT_FOUND = new AppError("Car not found", 404, "NOT_FOUND");
const LOCKED = new AppError("This listing can no longer be changed", 409, "LISTING_LOCKED");

type Actor = {
  id: string;
  role: RoleName;
};

function pagination(page: number, limit: number, total: number): ListingList["pagination"] {
  return {
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}

function listingOrderBy(
  sortBy: ListListingsQuery["sortBy"],
  sortOrder: ListListingsQuery["sortOrder"],
): Prisma.ListingOrderByWithRelationInput {
  switch (sortBy) {
    case "createdAt":
      return { createdAt: sortOrder };
    case "publishedAt":
      return { publishedAt: sortOrder };
    case "title":
      return { title: sortOrder };
    case "salePrice":
      return { salePrice: sortOrder };
    case "rentalDailyPrice":
      return { rentalDailyPrice: sortOrder };
  }
}

function priceRange(query: ListListingsQuery): Prisma.DecimalFilter | undefined {
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

function publicWhere(query: ListListingsQuery): Prisma.ListingWhereInput {
  const where: Prisma.ListingWhereInput = {
    status: ListingStatus.PUBLISHED,
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
  };
  const and: Prisma.ListingWhereInput[] = [];
  if (query.type) {
    where.type = query.type;
  }
  if (query.brand || query.model || query.location) {
    where.car = {
      ...(query.brand ? { brand: { equals: query.brand, mode: "insensitive" } } : {}),
      ...(query.model ? { model: { equals: query.model, mode: "insensitive" } } : {}),
      ...(query.location ? { location: { equals: query.location, mode: "insensitive" } } : {}),
    };
  }
  const range = priceRange(query);
  if (range) {
    if (query.type === ListingType.SALE) {
      where.salePrice = range;
    } else if (query.type === ListingType.RENT) {
      where.rentalDailyPrice = range;
    } else {
      and.push({ OR: [{ salePrice: range }, { rentalDailyPrice: range }] });
    }
  }
  if (query.search) {
    and.push({
      OR: [
        { title: { contains: query.search, mode: "insensitive" } },
        { description: { contains: query.search, mode: "insensitive" } },
        { car: { brand: { contains: query.search, mode: "insensitive" } } },
        { car: { model: { contains: query.search, mode: "insensitive" } } },
      ],
    });
  }
  if (and.length > 0) {
    where.AND = and;
  }
  return where;
}

function assertPriceMatchesType(type: ListingType, input: UpdateListingInput): void {
  if (type === ListingType.SALE && input.rentalDailyPrice) {
    throw new AppError("Sale listings cannot include a rental price", 422, "VALIDATION_ERROR");
  }
  if (type === ListingType.RENT && input.salePrice) {
    throw new AppError("Rental listings cannot include a sale price", 422, "VALIDATION_ERROR");
  }
  if (type === ListingType.SALE && input.salePrice === null) {
    throw new AppError("Sale listings require a sale price", 422, "VALIDATION_ERROR");
  }
  if (type === ListingType.RENT && input.rentalDailyPrice === null) {
    throw new AppError("Rental listings require a daily price", 422, "VALIDATION_ERROR");
  }
}

async function findListing(id: string): Promise<ListingRecord> {
  const listing = await PrismaService.client().listing.findUnique({
    where: { id },
    select: listingSelect,
  });
  if (!listing) {
    throw NOT_FOUND;
  }
  return listing;
}

function canViewListing(listing: ListingRecord, viewer?: Actor): boolean {
  if (listing.status === ListingStatus.PUBLISHED) {
    if (!listing.expiresAt || listing.expiresAt.getTime() > Date.now()) {
      return true;
    }
  }
  if (!viewer) {
    return false;
  }
  if (viewer.id === listing.ownerId) {
    return true;
  }
  return viewer.role === "ADMIN" || viewer.role === "MODERATOR" || viewer.role === "SUPER_ADMIN";
}

export const listingsService = {
  async list(query: ListListingsQuery): Promise<ListingList> {
    const where = publicWhere(query);
    const [total, listings] = await PrismaService.client().$transaction([
      PrismaService.client().listing.count({ where }),
      PrismaService.client().listing.findMany({
        where,
        select: listingSelect,
        orderBy: listingOrderBy(query.sortBy, query.sortOrder),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return { listings: listings.map(toPublicListing), pagination: pagination(query.page, query.limit, total) };
  },

  async listMine(actorId: string, query: MyListingsQuery): Promise<ListingList> {
    const where: Prisma.ListingWhereInput = {
      ownerId: resolvePartyId(actorId),
      ...(query.status ? { status: query.status } : {}),
    };
    const orderBy: Prisma.ListingOrderByWithRelationInput =
      query.sortBy === "updatedAt" ? { updatedAt: query.sortOrder } : { createdAt: query.sortOrder };
    const [total, listings] = await PrismaService.client().$transaction([
      PrismaService.client().listing.count({ where }),
      PrismaService.client().listing.findMany({
        where,
        select: listingSelect,
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return { listings: listings.map(toPublicListing), pagination: pagination(query.page, query.limit, total) };
  },

  async getById(id: string, viewer?: Actor): Promise<PublicListing> {
    const listing = await findListing(id);
    if (!canViewListing(listing, viewer)) {
      throw NOT_FOUND;
    }
    return toPublicListing(listing);
  },

  async create(actorId: string, input: CreateListingInput): Promise<PublicListing> {
    const ownerId = resolvePartyId(actorId);
    const car = await PrismaService.client().car.findUnique({
      where: { id: input.carId },
      select: { id: true, ownerId: true },
    });
    if (!car || car.ownerId !== ownerId) {
      throw CAR_NOT_FOUND;
    }

    const status = input.status ?? ListingStatus.DRAFT;
    assertListingTransition(ListingStatus.DRAFT, status, "owner");

    const listing = await PrismaService.client().$transaction(async (tx) => {
      const created = await tx.listing.create({
        data: {
          carId: car.id,
          ownerId,
          type: input.type,
          status,
          title: input.title,
          description: input.description,
          salePrice: input.salePrice ?? null,
          rentalDailyPrice: input.rentalDailyPrice ?? null,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        },
        select: listingSelect,
      });
      await writeNotifications(tx, [
        {
          userId: ownerId,
          type: NotificationType.LISTING,
          title: "Listing saved",
          message: `Your listing "${created.title}" was saved.`,
        },
      ]);
      await auditService.write(tx, {
        actorId: ownerId,
        action: AuditAction.LISTING_CREATED,
        resource: "listing",
        resourceId: created.id,
      });
      return created;
    });
    return toPublicListing(listing);
  },

  async update(actor: Actor, id: string, input: UpdateListingInput): Promise<PublicListing> {
    const existing = await findListing(id);
    assertCanModifyListing(actor.id, actor.role, existing.ownerId);
    if (existing.status === ListingStatus.SOLD || existing.status === ListingStatus.RENTED) {
      throw LOCKED;
    }
    assertPriceMatchesType(existing.type, input);
    if (input.status !== undefined) {
      assertListingTransition(existing.status, input.status, "owner");
    }

    const listing = await PrismaService.client().listing.update({
      where: { id: existing.id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.salePrice !== undefined ? { salePrice: input.salePrice } : {}),
        ...(input.rentalDailyPrice !== undefined ? { rentalDailyPrice: input.rentalDailyPrice } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt ? new Date(input.expiresAt) : null } : {}),
      },
      select: listingSelect,
    });
    return toPublicListing(listing);
  },

  async remove(actor: Actor, id: string): Promise<void> {
    const existing = await findListing(id);
    assertCanModifyListing(actor.id, actor.role, existing.ownerId);
    if (existing.status === ListingStatus.SOLD || existing.status === ListingStatus.RENTED) {
      throw LOCKED;
    }
    await PrismaService.client().listing.delete({ where: { id: existing.id } });
  },
};
