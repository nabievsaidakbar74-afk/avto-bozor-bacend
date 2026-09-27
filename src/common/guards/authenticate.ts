import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error.js";
import { verifyAccessToken } from "../security/jwt.js";

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    next(new AppError("Authentication required", 401, "UNAUTHORIZED"));
    return;
  }

  const token = header.slice("Bearer ".length).trim();
  if (token.length === 0) {
    next(new AppError("Authentication required", 401, "UNAUTHORIZED"));
    return;
  }

  try {
    req.auth = verifyAccessToken(token);
    next();
  } catch (error) {
    next(error);
  }
}
