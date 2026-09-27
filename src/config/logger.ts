import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { RequestHandler } from "express";
import pino from "pino";
import { pinoHttp } from "pino-http";
import { redactConnectionString } from "../common/errors/normalize-error.js";
import { env } from "./env.js";

const sensitiveValue =
  "(?:password(?:Hash)?|refreshToken|accessToken|authorization|cookie|jwt|cvv|cvc|cardNumber|pan|clientSecret|paymentSecret|JWT_SECRET|JWT_REFRESH_SECRET|DATABASE_URL)";

export function redactSensitiveText(value: string): string {
  return redactConnectionString(value)
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted]")
    .replace(new RegExp(`\\b${sensitiveValue}\\b\\s*[=:]\\s*(?:"[^"]*"|'[^']*'|\\S+)`, "gi"), "$1=[redacted]");
}

export const logRedactPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers['authorization']",
  "req.headers['cookie']",
  "res.headers.set-cookie",
  "res.headers['set-cookie']",
  "password",
  "passwordHash",
  "refreshToken",
  "accessToken",
  "jwt",
  "authorization",
  "cookie",
  "cvv",
  "cvc",
  "cardNumber",
  "pan",
  "clientSecret",
  "paymentSecret",
  "DATABASE_URL",
  "JWT_SECRET",
  "JWT_REFRESH_SECRET",
  "*.password",
  "*.passwordHash",
  "*.refreshToken",
  "*.accessToken",
  "*.jwt",
  "*.authorization",
  "*.cookie",
  "*.cvv",
  "*.cvc",
  "*.cardNumber",
  "*.pan",
  "*.clientSecret",
  "*.paymentSecret",
  "*.DATABASE_URL",
  "*.JWT_SECRET",
  "*.JWT_REFRESH_SECRET",
] as const;

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [...logRedactPaths],
    censor: "[REDACTED]",
  },
  serializers: {
    err(error: unknown) {
      if (!(error instanceof Error)) {
        return redactSensitiveText(typeof error === "string" ? error : "Unknown error");
      }
      const serialized = pino.stdSerializers.err(error);
      if (typeof serialized.message === "string") {
        serialized.message = redactSensitiveText(serialized.message);
      }
      if (typeof serialized.stack === "string") {
        serialized.stack = redactSensitiveText(serialized.stack);
      }
      return serialized;
    },
  },
});

function requestId(req: IncomingMessage): string {
  const header = req.headers["x-request-id"];
  if (typeof header === "string" && header.trim().length > 0) {
    return header;
  }
  return randomUUID();
}

export const requestLogger: RequestHandler = pinoHttp({
  logger,
  genReqId: requestId,
  autoLogging: env.NODE_ENV !== "test",
});
