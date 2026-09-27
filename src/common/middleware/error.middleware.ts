import type { NextFunction, Request, Response } from "express";
import { logger } from "../../config/logger.js";
import { normalizeError } from "../errors/normalize-error.js";

export function errorMiddleware(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const normalized = normalizeError(error);
  const logPayload = {
    code: normalized.code,
    statusCode: normalized.statusCode,
    method: req.method,
    path: req.originalUrl,
  };

  if (normalized.isOperational) {
    logger.warn(logPayload, normalized.message);
  } else {
    logger.error({ ...logPayload, err: error }, normalized.message);
  }

  const body: {
    success: false;
    message: string;
    code: string;
    details?: unknown;
  } = {
    success: false,
    message: normalized.message,
    code: normalized.code,
  };

  if (normalized.details !== undefined) {
    body.details = normalized.details;
  }

  res.status(normalized.statusCode).json(body);
}
