import type { CookieOptions, Request, Response } from "express";
import { env } from "../../config/env.js";
import { durationToMs } from "../../common/utils/duration.js";

export const REFRESH_COOKIE_NAME = "refreshToken";
const REFRESH_COOKIE_PATH = "/api/v1/auth";

function refreshCookieAttributes(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "none" : "lax",
    path: REFRESH_COOKIE_PATH,
  };
}

export function refreshCookieOptions(): CookieOptions {
  return {
    ...refreshCookieAttributes(),
    maxAge: durationToMs(env.JWT_REFRESH_EXPIRES_IN),
  };
}

export function readRefreshCookie(req: Request): string | undefined {
  const header = req.header("cookie");
  if (!header) {
    return undefined;
  }

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const name = part.slice(0, separator).trim();
    if (name !== REFRESH_COOKIE_NAME) {
      continue;
    }
    const value = part.slice(separator + 1).trim();
    return value.length > 0 ? decodeURIComponent(value) : undefined;
  }

  return undefined;
}

export function setRefreshCookie(res: Response, refreshToken: string): void {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieAttributes());
}
