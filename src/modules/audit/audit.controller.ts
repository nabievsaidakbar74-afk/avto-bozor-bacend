import type { Request, Response } from "express";
import { sendSuccess } from "../../common/utils/api-response.js";
import { asyncHandler } from "../../common/utils/async-handler.js";
import type { AuditListParams } from "./audit.dto.js";
import { auditService } from "./audit.service.js";

export const auditController = {
  list: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const query = req.query as unknown as AuditListParams;
    const result = await auditService.list({
      page: query.page,
      limit: query.limit,
      actor: query.actor,
      action: query.action,
      resource: query.resource,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    });
    sendSuccess(res, "Audit logs", result);
  }),
};
