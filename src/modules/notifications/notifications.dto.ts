import type { NotificationType } from "@prisma/client";
import type { z } from "zod";
import type { notificationIdParamSchema, notificationListQuerySchema } from "./notifications.validation.js";

export type NotificationIdParams = z.infer<typeof notificationIdParamSchema>;
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;

export type NotificationView = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
};

export type NotificationList = {
  notifications: NotificationView[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};
