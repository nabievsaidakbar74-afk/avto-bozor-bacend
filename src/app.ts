import cors from "cors";
import express, { type Express } from "express";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env.js";
import { requestLogger } from "./config/logger.js";
import { openApiDocument } from "./config/swagger.js";
import { errorMiddleware } from "./common/middleware/error.middleware.js";
import { notFoundMiddleware } from "./common/middleware/not-found.middleware.js";
import { apiRateLimiter } from "./common/middleware/rate-limit.middleware.js";
import { securityHeaders } from "./common/middleware/security.middleware.js";
import { storageRoot, UPLOAD_PUBLIC_BASE_PATH } from "./infrastructure/storage/storage.service.js";
import { apiRouter } from "./modules/register-routes.js";
import "./types/express.js";

export function createApp(): Express {
  const app = express();
  app.disable("x-powered-by");

  if (env.TRUST_PROXY) {
    app.set("trust proxy", 1);
  }

  app.use(securityHeaders);
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(",").map((origin) => origin.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));
  app.use(requestLogger);
  app.use("/api", apiRateLimiter);
  app.use("/api/v1", apiRouter);
  app.use(
    UPLOAD_PUBLIC_BASE_PATH,
    express.static(storageRoot(), {
      dotfiles: "deny",
      index: false,
      redirect: false,
    }),
  );
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument, {
    customSiteTitle: "Avto Bozor API",
    swaggerOptions: {
      tagsSorter: (left: string, right: string) => {
        const order = [
          "Authentication",
          "Users",
          "Cars",
          "Listings",
          "Purchases",
          "Rentals",
          "Bookings",
          "Payments",
          "Favorites",
          "Reviews",
          "Notifications",
          "Reports",
          "Admin Dashboard",
          "Admin Users",
          "Admin Cars",
          "Admin Listings",
          "Admin Sales",
          "Admin Rentals",
          "Admin Payments",
          "Admin Reports",
          "Admin Moderation",
          "Admin Audit",
          "Health / System",
        ];
        return order.indexOf(left) - order.indexOf(right);
      },
    },
  }));
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}
