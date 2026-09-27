import helmet from "helmet";
import type { RequestHandler } from "express";

const defaultHelmet = helmet();
const docsHelmet = helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
});

export const securityHeaders: RequestHandler = (req, res, next) => {
  if (req.originalUrl.startsWith("/api/docs")) {
    docsHelmet(req, res, next);
    return;
  }
  defaultHelmet(req, res, next);
};
