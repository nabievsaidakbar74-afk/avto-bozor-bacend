import { ListingStatus, ListingType, NotificationType } from "@prisma/client";
import { AppError } from "../../common/errors/app-error.js";
import { resolvePartyId } from "../../common/security/ownership.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import { AuditAction, auditService } from "../audit/audit.service.js";
import { parseBookingDate } from "../bookings/booking-dates.js";
import { writeNotifications } from "../notifications/notifications.service.js";
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

export const rentalsService = {
  async publish(actorId: string, input: PublishRentalInput): Promise<RentalListingView> {
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
          status: ListingStatus.PENDING_MODERATION,
          title,
          description: input.description,
          rentalDailyPrice: input.dailyPrice,
          expiresAt: availableUntil,
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
      await writeNotifications(tx, [
        {
          userId: ownerId,
          type: NotificationType.LISTING,
          title: "Rental submitted",
          message: `Your rental listing "${title}" is waiting for review.`,
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

    return {
      id: listing.id,
      carId: listing.carId,
      ownerId: listing.ownerId,
      description: listing.description,
      dailyPrice: listing.rentalDailyPrice?.toFixed(2) ?? "0.00",
      location,
      availableUntil: listing.expiresAt ? listing.expiresAt.toISOString().slice(0, 10) : null,
      status: listing.status,
    };
  },
};
