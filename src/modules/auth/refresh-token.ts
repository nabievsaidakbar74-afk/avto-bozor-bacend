import { createHmac, randomBytes } from "node:crypto";
import { env } from "../../config/env.js";

export function generateRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  return createHmac("sha256", env.JWT_REFRESH_SECRET).update(token).digest("hex");
}
