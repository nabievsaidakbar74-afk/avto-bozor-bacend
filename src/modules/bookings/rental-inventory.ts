import { CarStatus, ListingStatus, ListingType, Prisma, RentalBookingStatus } from "@prisma/client";
import { assertListingTransition } from "../listings/listing-status.js";

const BLOCKING_STATUSES = [RentalBookingStatus.CONFIRMED, RentalBookingStatus.ACTIVE] as const;

export async function markRentalOccupied(tx: Prisma.TransactionClient, carId: string): Promise<void> {
  const listing = await tx.listing.findFirst({
    where: { carId, type: ListingType.RENT, status: ListingStatus.PUBLISHED },
    orderBy: { publishedAt: "desc" },
    select: { id: true, status: true },
  });
  await tx.car.update({
    where: { id: carId },
    data: { status: CarStatus.RENTED },
  });
  if (!listing) {
    return;
  }
  await tx.$queryRaw`SELECT id FROM listings WHERE id = ${listing.id}::uuid FOR UPDATE`;
  assertListingTransition(listing.status, ListingStatus.RENTED, "transaction");
  await tx.listing.update({
    where: { id: listing.id },
    data: { status: ListingStatus.RENTED },
  });
}

export async function releaseRentalIfIdle(tx: Prisma.TransactionClient, carId: string): Promise<void> {
  const remaining = await tx.rentalBooking.findFirst({
    where: { carId, status: { in: [...BLOCKING_STATUSES] } },
    select: { id: true },
  });
  if (remaining) {
    return;
  }

  const car = await tx.car.findUnique({
    where: { id: carId },
    select: { status: true },
  });
  if (car?.status === CarStatus.RENTED) {
    await tx.car.update({
      where: { id: carId },
      data: { status: CarStatus.AVAILABLE },
    });
  }

  const listing = await tx.listing.findFirst({
    where: { carId, type: ListingType.RENT, status: ListingStatus.RENTED },
    orderBy: { updatedAt: "desc" },
    select: { id: true, status: true },
  });
  if (!listing) {
    return;
  }
  assertListingTransition(listing.status, ListingStatus.PUBLISHED, "transaction");
  await tx.listing.update({
    where: { id: listing.id },
    data: { status: ListingStatus.PUBLISHED },
  });
}
