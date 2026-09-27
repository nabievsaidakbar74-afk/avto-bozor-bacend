import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { errorMiddleware } from "../../src/common/middleware/error.middleware.js";
import { validate } from "../../src/common/middleware/validate.middleware.js";

describe("validate middleware", () => {
  const app = express();
  app.use(express.json());
  app.post(
    "/echo",
    validate({
      body: z.object({
        name: z.string().min(1),
      }),
    }),
    (req, res) => {
      const body: unknown = req.body;
      const name =
        typeof body === "object" && body !== null && "name" in body ? body.name : undefined;
      res.status(200).json({ success: true, message: "ok", name });
    },
  );
  app.use(errorMiddleware);

  it("passes a valid body through", async () => {
    const response = await request(app).post("/echo").send({ name: "Cobalt" });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, message: "ok", name: "Cobalt" });
  });

  it("returns 422 for an invalid body", async () => {
    const response = await request(app).post("/echo").send({ name: "" });
    expect(response.status).toBe(422);
    expect(response.body.success).toBe(false);
    expect(response.body.code).toBe("VALIDATION_ERROR");
  });
});
