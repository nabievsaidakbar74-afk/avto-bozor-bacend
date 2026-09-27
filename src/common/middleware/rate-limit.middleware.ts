import rateLimit from "express-rate-limit";
import { env } from "../../config/env.js";

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => env.NODE_ENV === "test" && req.header("x-test-rate-limit") !== "enforce",
  message: {
    success: false,
    message: "Too many requests",
    code: "RATE_LIMITED",
  },
});

export const apiRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => env.NODE_ENV === "test" || req.originalUrl.startsWith("/api/docs"),
  message: {
    success: false,
    message: "Too many requests",
    code: "RATE_LIMITED",
  },
});
