import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ZodType } from "zod";

type RequestSchemas = {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
};

export function validate(schemas: RequestSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body) as Request["body"];
      }
      if (schemas.query) {
        const parsed: unknown = schemas.query.parse(req.query);
        if (typeof parsed === "object" && parsed !== null) {
          Object.assign(req.query, parsed);
        }
      }
      if (schemas.params) {
        const parsed: unknown = schemas.params.parse(req.params);
        if (typeof parsed === "object" && parsed !== null) {
          Object.assign(req.params, parsed);
        }
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
