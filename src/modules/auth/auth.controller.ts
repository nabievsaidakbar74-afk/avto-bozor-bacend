import type { Request, Response } from "express";
import { AppError } from "../../common/errors/app-error.js";
import { asyncHandler } from "../../common/utils/async-handler.js";
import { sendSuccess } from "../../common/utils/api-response.js";
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from "./auth.cookies.js";
import type { LoginInput, RegisterInput, SafeUser } from "./auth.dto.js";
import { authService } from "./auth.service.js";

function publicSession(session: { accessToken: string; user: SafeUser }): {
  accessToken: string;
  user: SafeUser;
} {
  return {
    accessToken: session.accessToken,
    user: session.user,
  };
}

function requestMeta(req: Request): { ip: string | null; userAgent: string | null } {
  return {
    ip: req.ip ?? null,
    userAgent: req.get("user-agent") ?? null,
  };
}

export const authController = {
  register: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const user = await authService.register(req.body as RegisterInput, requestMeta(req));
    sendSuccess(res, "Account created", { user }, 201);
  }),

  login: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const session = await authService.login(req.body as LoginInput, requestMeta(req));
    setRefreshCookie(res, session.refreshToken);
    sendSuccess(res, "Login successful", publicSession(session));
  }),

  refresh: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const session = await authService.refresh(readRefreshCookie(req));
      setRefreshCookie(res, session.refreshToken);
      sendSuccess(res, "Session refreshed", publicSession(session));
    } catch (error) {
      clearRefreshCookie(res);
      throw error;
    }
  }),

  logout: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    await authService.logout(readRefreshCookie(req), requestMeta(req));
    clearRefreshCookie(res);
    sendSuccess(res, "Logged out");
  }),

  me: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.auth?.sub;
    if (!userId) {
      throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    }
    const user = await authService.getMe(userId);
    sendSuccess(res, "Authenticated user", { user });
  }),
};
