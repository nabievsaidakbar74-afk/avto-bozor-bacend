import { CarStatus, Prisma, PurchaseStatus, RentalBookingStatus, ReviewStatus } from "@prisma/client";
import { AppError } from "../../common/errors/app-error.js";
import { resolvePartyId } from "../../common/security/ownership.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import { publicCarStatuses } from "../cars/cars.validation.js";
import type { CreateReviewInput, ReviewList, ReviewListQuery, ReviewView } from "./reviews.dto.js";

const NOT_FOUND = new AppError("Review not found", 404, "NOT_FOUND");
const CAR_NOT_FOUND = new AppError("Car not found", 404, "NOT_FOUND");
const NOT_ALLOWED = new AppError("Only a completed transaction can be reviewed", 409, "REVIEW_NOT_ALLOWED");
const SELF_REVIEW = new AppError("You cannot review yourself", 409, "CANNOT_REVIEW_SELF");
const DUPLICATE = new AppError("You already reviewed this transaction", 409, "REVIEW_EXISTS");

const reviewSelect = {
  id: true,
  carId: true,
  rating: true,
  comment: true,
  createdAt: true,
  author: {
    select: { id: true, firstName: true, lastName: true },
  },
} satisfies Prisma.ReviewSelect;

type ReviewRecord = Prisma.ReviewGetPayload<{ select: typeof reviewSelect }>;

function toView(review: ReviewRecord): ReviewView {
  return review;
}

function isPublicCar(status: CarStatus): boolean {
  return (publicCarStatuses as readonly CarStatus[]).includes(status);
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export const reviewsService = {
  async create(actorId: string, input: CreateReviewInput): Promise<ReviewView> {
    const authorId = resolvePartyId(actorId);
    try {
      const reviewId = await PrismaService.client().$transaction(async (tx) => {
        const context = input.purchaseId
          ? await purchaseContext(tx, input.purchaseId, authorId)
          : await bookingContext(tx, input.bookingId ?? "", authorId);
        if (context.targetUserId === authorId) {
          throw SELF_REVIEW;
        }
        const created = await tx.review.create({
          data: {
            authorId,
            targetUserId: context.targetUserId,
            carId: context.carId,
            purchaseId: context.purchaseId,
            bookingId: context.bookingId,
            rating: input.rating,
            comment: input.comment,
            status: ReviewStatus.PUBLISHED,
          },
          select: { id: true },
        });
        return created.id;
      });
      const review = await PrismaService.client().review.findUnique({
        where: { id: reviewId },
        select: reviewSelect,
      });
      if (!review) {
        throw NOT_FOUND;
      }
      return toView(review);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw DUPLICATE;
      }
      throw error;
    }
  },

  async listForCar(carId: string, query: ReviewListQuery): Promise<ReviewList> {
    const car = await PrismaService.client().car.findUnique({
      where: { id: carId },
      select: { id: true, status: true },
    });
    if (!car || !isPublicCar(car.status)) {
      throw CAR_NOT_FOUND;
    }
    const where: Prisma.ReviewWhereInput = {
      carId: car.id,
      status: ReviewStatus.PUBLISHED,
    };
    const [total, reviews] = await PrismaService.client().$transaction([
      PrismaService.client().review.count({ where }),
      PrismaService.client().review.findMany({
        where,
        select: reviewSelect,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return {
      reviews: reviews.map(toView),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
      },
    };
  },
};

async function purchaseContext(
  tx: Prisma.TransactionClient,
  purchaseId: string,
  authorId: string,
): Promise<{ targetUserId: string; carId: string; purchaseId: string; bookingId: null }> {
  const purchase = await tx.purchase.findUnique({
    where: { id: purchaseId },
    select: { id: true, carId: true, buyerId: true, sellerId: true, status: true },
  });
  if (!purchase || (purchase.buyerId !== authorId && purchase.sellerId !== authorId)) {
    throw NOT_FOUND;
  }
  if (purchase.status !== PurchaseStatus.COMPLETED) {
    throw NOT_ALLOWED;
  }
  return {
    targetUserId: purchase.buyerId === authorId ? purchase.sellerId : purchase.buyerId,
    carId: purchase.carId,
    purchaseId: purchase.id,
    bookingId: null,
  };
}

async function bookingContext(
  tx: Prisma.TransactionClient,
  bookingId: string,
  authorId: string,
): Promise<{ targetUserId: string; carId: string; purchaseId: null; bookingId: string }> {
  const booking = await tx.rentalBooking.findUnique({
    where: { id: bookingId },
    select: { id: true, carId: true, renterId: true, ownerId: true, status: true },
  });
  if (!booking || (booking.renterId !== authorId && booking.ownerId !== authorId)) {
    throw NOT_FOUND;
  }
  if (booking.status !== RentalBookingStatus.COMPLETED) {
    throw NOT_ALLOWED;
  }
  return {
    targetUserId: booking.renterId === authorId ? booking.ownerId : booking.renterId,
    carId: booking.carId,
    purchaseId: null,
    bookingId: booking.id,
  };
}
