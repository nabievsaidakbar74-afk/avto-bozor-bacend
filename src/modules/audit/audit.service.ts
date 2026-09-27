import { Prisma } from "@prisma/client";
import { logger } from "../../config/logger.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";

export const AuditAction = {
  LOGIN: "LOGIN",
  LOGOUT: "LOGOUT",
  USER_CREATED: "USER_CREATED",
  USER_UPDATED: "USER_UPDATED",
  USER_BLOCKED: "USER_BLOCKED",
  CAR_CREATED: "CAR_CREATED",
  CAR_UPDATED: "CAR_UPDATED",
  CAR_DELETED: "CAR_DELETED",
  LISTING_CREATED: "LISTING_CREATED",
  LISTING_APPROVED: "LISTING_APPROVED",
  LISTING_REJECTED: "LISTING_REJECTED",
  PURCHASE_CREATED: "PURCHASE_CREATED",
  BOOKING_CREATED: "BOOKING_CREATED",
  BOOKING_CONFIRMED: "BOOKING_CONFIRMED",
  BOOKING_CANCELLED: "BOOKING_CANCELLED",
  PAYMENT_UPDATED: "PAYMENT_UPDATED",
  ADMIN_ACTION: "ADMIN_ACTION",
} as const;

export type AuditActionName = (typeof AuditAction)[keyof typeof AuditAction];

export type AuditMetadata = Record<string, string | number | boolean | null>;

export type AuditEvent = {
  action: string;
  actorId?: string;
  targetId?: string;
  metadata?: AuditMetadata;
};

export type AuditWrite = {
  actorId: string;
  action: string;
  resource: string;
  resourceId: string;
  metadata?: AuditMetadata;
  ip?: string | null;
  userAgent?: string | null;
};

export type AuditListQuery = {
  page: number;
  limit: number;
  actor?: string;
  action?: string;
  resource?: string;
  from?: Date;
  to?: Date;
};

export type AuditLogView = {
  id: string;
  actorId: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  metadata: Prisma.JsonValue;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
  actor: { id: string; firstName: string; lastName: string } | null;
};

type AuditWriter = Prisma.TransactionClient | ReturnType<typeof PrismaService.client>;

const auditSelect = {
  id: true,
  actorId: true,
  action: true,
  resource: true,
  resourceId: true,
  metadata: true,
  ip: true,
  userAgent: true,
  createdAt: true,
  actor: {
    select: { id: true, firstName: true, lastName: true },
  },
} satisfies Prisma.AuditLogSelect;

function auditData(event: AuditWrite): Prisma.AuditLogCreateInput {
  return {
    actor: { connect: { id: event.actorId } },
    action: event.action.slice(0, 120),
    resource: event.resource.slice(0, 80),
    resourceId: event.resourceId.slice(0, 64),
    metadata: event.metadata ?? {},
    ip: event.ip ? event.ip.slice(0, 45) : null,
    userAgent: event.userAgent ? event.userAgent.slice(0, 512) : null,
  };
}

export const auditService = {
  record(event: AuditEvent): void {
    logger.info(
      {
        audit: true,
        action: event.action,
        actorId: event.actorId ?? null,
        targetId: event.targetId ?? null,
        metadata: event.metadata ?? null,
      },
      "audit_event",
    );
  },

  async write(db: AuditWriter, event: AuditWrite): Promise<void> {
    this.record({
      action: event.action,
      actorId: event.actorId,
      targetId: event.resourceId,
      metadata: event.metadata,
    });
    await db.auditLog.create({ data: auditData(event) });
  },

  async persist(event: AuditWrite): Promise<void> {
    await this.write(PrismaService.client(), event);
  },

  async list(query: AuditListQuery): Promise<{
    logs: AuditLogView[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.actor ? { actorId: query.actor } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.resource ? { resource: query.resource } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
    };
    const [total, logs] = await PrismaService.client().$transaction([
      PrismaService.client().auditLog.count({ where }),
      PrismaService.client().auditLog.findMany({
        where,
        select: auditSelect,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return {
      logs,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
      },
    };
  },
};
