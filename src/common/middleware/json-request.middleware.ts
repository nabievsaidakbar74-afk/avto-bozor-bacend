import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error.js";

const UNSUPPORTED = new AppError("JSON content type is required", 415, "UNSUPPORTED_MEDIA_TYPE");

/** Blocks cookie-bearing form posts. Cross-site JSON requests must pass the CORS preflight. */
export function requireJsonRequest(req: Request, _res: Response, next: NextFunction): void {
  const contentType = req.header("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    next(UNSUPPORTED);
    return;
  }
  next();
}
