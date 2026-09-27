import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../../config/env.js";
import { AppError } from "../errors/app-error.js";
import { isRoleName, type RoleName } from "./roles.js";

export type AccessTokenPayload = {
  sub: string;
  role: RoleName;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toExpiresIn(value: string): SignOptions["expiresIn"] {
  return value as SignOptions["expiresIn"];
}

function readVerifiedToken(token: string): unknown {
  return jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign({ sub: payload.sub, role: payload.role }, env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: toExpiresIn(env.JWT_EXPIRES_IN),
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  let decoded: unknown;
  try {
    decoded = readVerifiedToken(token);
  } catch {
    throw new AppError("Invalid or expired token", 401, "UNAUTHORIZED");
  }

  if (!isRecord(decoded) || typeof decoded["sub"] !== "string" || !isRoleName(decoded["role"])) {
    throw new AppError("Invalid or expired token", 401, "UNAUTHORIZED");
  }

  return {
    sub: decoded["sub"],
    role: decoded["role"],
  };
}
