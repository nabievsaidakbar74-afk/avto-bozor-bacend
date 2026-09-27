import type { Request, Response } from "express";
import { asyncHandler } from "../../common/utils/async-handler.js";
import { sendSuccess } from "../../common/utils/api-response.js";
import { healthService } from "./health.provider.js";

export const healthController = {
  getHealth: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    await healthService.getStatus();
    sendSuccess(res, "API is healthy");
  }),
};
