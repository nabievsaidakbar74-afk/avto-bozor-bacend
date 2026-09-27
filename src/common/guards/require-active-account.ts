import { UserStatus } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error.js";
import { isRoleName } from "../security/roles.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import { safeUserSelect } from "../../modules/auth/auth.dto.js";

const UNAUTHORIZED = new AppError("Authentication required", 401, "UNAUTHORIZED");
const ACCOUNT_DISABLED = new AppError("This account cannot sign in", 403, "ACCOUNT_DISABLED");

export function requireActiveAccount(req: Request, _res: Response, next: NextFunction): void {
  const userId = req.auth?.sub;
  if (!userId) {
    next(UNAUTHORIZED);
    return;
  }

  PrismaService.client()
    .user.findUnique({
      where: { id: userId },
      select: safeUserSelect,
    })
    .then((user) => {
      if (!user || !isRoleName(user.role)) {
        next(UNAUTHORIZED);
        return;
      }
      if (user.status === UserStatus.SUSPENDED || user.status === UserStatus.BLOCKED) {
        next(ACCOUNT_DISABLED);
        return;
      }
      req.auth = { sub: user.id, role: user.role };
      req.actor = user;
      next();
    })
    .catch(next);
}
