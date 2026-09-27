import { ZodError } from "zod";
import { env } from "../../config/env.js";
import { AppError } from "./app-error.js";

type PrismaLikeError = {
  code: string;
  clientVersion: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPrismaKnownRequestError(error: unknown): error is PrismaLikeError {
  if (!isRecord(error)) {
    return false;
  }
  return typeof error["code"] === "string" && typeof error["clientVersion"] === "string";
}

export function redactConnectionString(message: string): string {
  return message.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]");
}

function isJsonParseError(error: unknown): boolean {
  if (!(error instanceof SyntaxError) || !isRecord(error)) {
    return false;
  }
  return error["type"] === "entity.parse.failed";
}

function zodDetails(error: ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

export function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new AppError("Validation failed", 422, "VALIDATION_ERROR", {
      details: zodDetails(error),
    });
  }

  if (isJsonParseError(error)) {
    return new AppError("Malformed JSON body", 400, "MALFORMED_JSON");
  }

  if (isPrismaKnownRequestError(error)) {
    if (error.code === "P2002") {
      return new AppError("Resource already exists", 409, "CONFLICT");
    }
    if (error.code === "P2025") {
      return new AppError("Resource not found", 404, "NOT_FOUND");
    }
    return new AppError("Internal server error", 500, "INTERNAL_ERROR", {
      isOperational: false,
    });
  }

  const message =
    env.NODE_ENV === "development" && error instanceof Error
      ? redactConnectionString(error.message)
      : "Internal server error";

  return new AppError(message, 500, "INTERNAL_ERROR", { isOperational: false });
}
