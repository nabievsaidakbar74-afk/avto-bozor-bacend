import { NotificationType, Prisma } from "@prisma/client";
import { AppError } from "../../common/errors/app-error.js";
import { resolvePartyId } from "../../common/security/ownership.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import type { NotificationList, NotificationListQuery, NotificationView } from "./notifications.dto.js";

const NOT_FOUND = new AppError("Notification not found", 404, "NOT_FOUND");

export type NotificationDraft = {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
};

const notificationSelect = {
  id: true,
  type: true,
  title: true,
  message: true,
  read: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

type NotificationRecord = Prisma.NotificationGetPayload<{ select: typeof notificationSelect }>;

function toView(notification: NotificationRecord): NotificationView {
  return notification;
}

export async function writeNotifications(
  db: Prisma.TransactionClient,
  items: readonly NotificationDraft[],
): Promise<void> {
  if (items.length === 0) {
    return;
  }
  await db.notification.createMany({
    data: items.map((item) => ({
      userId: item.userId,
      type: item.type,
      title: item.title.slice(0, 160),
      message: item.message,
    })),
  });
}

export const notificationsService = {
  async list(actorId: string, query: NotificationListQuery): Promise<NotificationList> {
    const userId = resolvePartyId(actorId);
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(query.unread === true ? { read: false } : {}),
    };
    const [total, notifications] = await PrismaService.client().$transaction([
      PrismaService.client().notification.count({ where }),
      PrismaService.client().notification.findMany({
        where,
        select: notificationSelect,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return {
      notifications: notifications.map(toView),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
      },
    };
  },

  async markRead(actorId: string, id: string): Promise<NotificationView> {
    const userId = resolvePartyId(actorId);
    const existing = await PrismaService.client().notification.findFirst({
      where: { id, userId },
      select: notificationSelect,
    });
    if (!existing) {
      throw NOT_FOUND;
    }
    if (existing.read) {
      return toView(existing);
    }
    const updated = await PrismaService.client().notification.update({
      where: { id: existing.id },
      data: { read: true },
      select: notificationSelect,
    });
    return toView(updated);
  },

  async markAllRead(actorId: string): Promise<{ updated: number }> {
    const userId = resolvePartyId(actorId);
    const result = await PrismaService.client().notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    return { updated: result.count };
  },
};
