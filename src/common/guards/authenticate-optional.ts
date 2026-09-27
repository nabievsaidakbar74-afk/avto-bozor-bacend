import type { NextFunction, Request, Response } from "express";
import { authenticate } from "./authenticate.js";
import { requireActiveAccount } from "./require-active-account.js";

export function authenticateOptional(req: Request, res: Response, next: NextFunction): void {
  if (!req.header("authorization")) {
    next();
    return;
  }

  authenticate(req, res, (error: unknown) => {
    if (error) {
      next(error);
      return;
    }
    requireActiveAccount(req, res, next);
  });
}
