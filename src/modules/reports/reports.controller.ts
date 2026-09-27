import type { Request, Response } from "express";
import { AppError } from "../../common/errors/app-error.js";
import { isRoleName, type RoleName } from "../../common/security/roles.js";
import { sendSuccess } from "../../common/utils/api-response.js";
import { asyncHandler } from "../../common/utils/async-handler.js";
import type { CreateReportInput, ReportIdParams, ReportListQuery, UpdateReportInput } from "./reports.dto.js";
import { reportsService } from "./reports.service.js";

function actor(req: Request): { id: string; role: RoleName } {
  if (!req.actor || !isRoleName(req.actor.role)) {
    throw new AppError("Authentication required", 401, "UNAUTHORIZED");
  }
  return { id: req.actor.id, role: req.actor.role };
}

function meta(req: Request): { ip: string | null; userAgent: string | null } {
  return {
    ip: req.ip ?? null,
    userAgent: req.get("user-agent") ?? null,
  };
}

export const reportsController = {
  create: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const report = await reportsService.create(actor(req).id, req.body as CreateReportInput);
    sendSuccess(res, "Report submitted", { report }, 201);
  }),

  listOwn: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await reportsService.listOwn(actor(req).id, req.query as unknown as ReportListQuery);
    sendSuccess(res, "Reports", result);
  }),

  getOwn: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const params = req.params as unknown as ReportIdParams;
    const report = await reportsService.getForReporter(actor(req).id, params.id);
    sendSuccess(res, "Report", { report });
  }),

  list: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await reportsService.listForStaff(req.query as unknown as ReportListQuery);
    sendSuccess(res, "Reports", result);
  }),

  update: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const params = req.params as unknown as ReportIdParams;
    const report = await reportsService.updateStatus(
      actor(req),
      params.id,
      req.body as UpdateReportInput,
      meta(req),
    );
    sendSuccess(res, "Report updated", { report });
  }),
};
