import type { ReportStatus } from "@prisma/client";
import type { z } from "zod";
import type { createReportSchema, reportIdParamSchema, reportListQuerySchema, updateReportSchema } from "./reports.validation.js";

export type CreateReportInput = z.infer<typeof createReportSchema>;
export type UpdateReportInput = z.infer<typeof updateReportSchema>;
export type ReportIdParams = z.infer<typeof reportIdParamSchema>;
export type ReportListQuery = z.infer<typeof reportListQuerySchema>;

export type ReportView = {
  id: string;
  reporterId: string;
  targetUserId: string | null;
  carId: string | null;
  listingId: string | null;
  reviewId: string | null;
  reason: string;
  description: string;
  status: ReportStatus;
  createdAt: Date;
  updatedAt: Date;
};
