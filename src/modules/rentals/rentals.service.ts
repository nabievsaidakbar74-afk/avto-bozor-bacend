import { ListingStatus, ListingType, NotificationType } from "@prisma/client";
import { AppError } from "../../common/errors/app-error.js";
import { resolvePartyId } from "../../common/security/ownership.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import { AuditAction, auditService } from "../audit/audit.service.js";
import { parseBookingDate } from "../bookings/booking-dates.js";
import { writeNotifications } from "../notifications/notifications.service.js";
import {
  listingModerationService,
  moderationAuditMetadata,
  type ListingModerationResult,
} from "../listings/listing-moderation.service.js";
import type { PublishRentalInput } from "./rentals.dto.js";

const CAR_NOT_FOUND = new AppError("Car not found", 404, "NOT_FOUND");

export type RentalListingView = {
  id: string;
  carId: string;
  ownerId: string;
  description: string;
  dailyPrice: string;
  location: string;
  availableUntil: string | null;
  status: ListingStatus;
};

export type RentalPublishResult = {
  listing: RentalListingView;
  moderation: ListingModerationResult;
};

function rentalNotice(title: string, moderation: ListingModerationResult): { title: string; message: string } {
  if (moderation.status === ListingStatus.PUBLISHED) {
    return { title: "Rental published", message: `Your rental listing "${title}" is now public.` };
  }
  if (moderation.status === ListingStatus.REJECTED) {
    return {
      title: "Rental rejected",
      message: `Your rental listing "${title}" was rejected. ${moderation.reasons.join(" ")}`,
    };
  }
  const detail = moderation.reasons.length > 0 ? ` ${moderation.reasons.join(" ")}` : "";
  return {
    title: "Rental submitted",
    message: `Your rental listing "${title}" is waiting for review.${detail}`,
  };
}

export const rentalsService = {
  async publish(actorId: string, input: PublishRentalInput): Promise<RentalPublishResult> {
    const ownerId = resolvePartyId(actorId);
    const car = await PrismaService.client().car.findUnique({
      where: { id: input.carId },
      select: { id: true, ownerId: true, brand: true, model: true, location: true },
    });
    if (!car || car.ownerId !== ownerId) {
      throw CAR_NOT_FOUND;
    }

    const availableUntil = input.availableUntil ? parseBookingDate(input.availableUntil) : null;
    const location = input.location ?? car.location;
    const title = `${car.brand} ${car.model}`.slice(0, 160);
    const moderation = await listingModerationService.review({
      carId: car.id,
      ownerId,
      type: ListingType.RENT,
      title,
      description: input.description,
      salePrice: null,
      rentalDailyPrice: input.dailyPrice,
      location,
      expiresAt: availableUntil,
    });
    const listing = await PrismaService.client().$transaction(async (tx) => {
      if (input.location) {
        await tx.car.update({
          where: { id: car.id },
          data: { location: input.location },
        });
      }
      const created = await tx.listing.create({
        data: {
          carId: car.id,
          ownerId,
          type: ListingType.RENT,
          status: moderation.status,
          title,
          description: input.description,
          rentalDailyPrice: input.dailyPrice,
          expiresAt: availableUntil,
          ...(moderation.status === ListingStatus.PUBLISHED ? { publishedAt: new Date() } : {}),
        },
        select: {
          id: true,
          carId: true,
          ownerId: true,
          description: true,
          rentalDailyPrice: true,
          expiresAt: true,
          status: true,
        },
      });
      const notice = rentalNotice(title, moderation);
      await writeNotifications(tx, [
        {
          userId: ownerId,
          type: NotificationType.LISTING,
          title: notice.title,
          message: notice.message,
        },
      ]);
      await auditService.write(tx, {
        actorId: ownerId,
        action: AuditAction.LISTING_CREATED,
        resource: "listing",
        resourceId: created.id,
        metadata: moderationAuditMetadata(moderation),
      });
      return created;
    });

    return {
      listing: {
        id: listing.id,
        carId: listing.carId,
        ownerId: listing.ownerId,
        description: listing.description,
        dailyPrice: listing.rentalDailyPrice?.toFixed(2) ?? "0.00",
        location,
        availableUntil: listing.expiresAt ? listing.expiresAt.toISOString().slice(0, 10) : null,
        status: listing.status,
      },
      moderation,
    };
  },
};
