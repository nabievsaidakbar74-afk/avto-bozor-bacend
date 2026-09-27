import { ListingStatus, NotificationType, Prisma } from "@prisma/client";
import { AppError } from "../../common/errors/app-error.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import { AuditAction, auditService } from "../audit/audit.service.js";
import { writeNotifications } from "../notifications/notifications.service.js";
import type { ListingList, PublicListing } from "../listings/listings.dto.js";
import { assertListingTransition } from "../listings/listing-status.js";
import { listingSelect, toPublicListing } from "../listings/listings.presenter.js";
import type { PendingListingsQuery, RejectListingInput } from "./moderation.dto.js";

const NOT_FOUND = new AppError("Listing not found", 404, "NOT_FOUND");

type RequestMeta = {
  ip?: string | null;
  userAgent?: string | null;
};

async function moderate(
  id: string,
  to: typeof ListingStatus.PUBLISHED | typeof ListingStatus.REJECTED,
  actorId: string,
  action: string,
  metadata: Record<string, string>,
  meta: RequestMeta,
  extra?: Prisma.ListingUpdateInput,
): Promise<PublicListing> {
  const existing = await PrismaService.client().listing.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!existing) {
    throw NOT_FOUND;
  }
  assertListingTransition(existing.status, to, "moderation");

  const auditMetadata = { from: existing.status, to, ...metadata };
  const listing = await PrismaService.client().$transaction(async (tx) => {
    const updated = await tx.listing.update({
      where: { id: existing.id },
      data: { status: to, ...extra },
      select: listingSelect,
    });
    await auditService.write(tx, {
      actorId,
      action,
      resource: "listing",
      resourceId: updated.id,
      metadata: auditMetadata,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    await writeNotifications(tx, [
      {
        userId: updated.ownerId,
        type: NotificationType.MODERATION,
        title: to === ListingStatus.PUBLISHED ? "Listing approved" : "Listing rejected",
        message:
          to === ListingStatus.PUBLISHED
            ? `Your listing "${updated.title}" is now public.`
            : `Your listing "${updated.title}" was rejected.`,
      },
    ]);
    return updated;
  });

  return toPublicListing(listing);
}

export const moderationService = {
  async listPending(query: PendingListingsQuery): Promise<ListingList> {
    const where = { status: ListingStatus.PENDING_MODERATION };
    const [total, listings] = await PrismaService.client().$transaction([
      PrismaService.client().listing.count({ where }),
      PrismaService.client().listing.findMany({
        where,
        select: listingSelect,
        orderBy: { createdAt: query.sortOrder },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);

    return {
      listings: listings.map(toPublicListing),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
      },
    };
  },

  async approve(actorId: string, id: string, meta: RequestMeta): Promise<PublicListing> {
    return moderate(id, ListingStatus.PUBLISHED, actorId, AuditAction.LISTING_APPROVED, {}, meta, {
      publishedAt: new Date(),
    });
  },

  async reject(
    actorId: string,
    id: string,
    input: RejectListingInput,
    meta: RequestMeta,
  ): Promise<PublicListing> {
    return moderate(id, ListingStatus.REJECTED, actorId, AuditAction.LISTING_REJECTED, { reason: input.reason }, meta);
  },
};
