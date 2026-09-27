import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger, redactSensitiveText } from "./config/logger.js";
import { createShutdownHandler } from "./infrastructure/http/shutdown.js";
import { PrismaService } from "./infrastructure/prisma/prisma.service.js";

const app = createApp();

const server = app.listen(env.PORT, env.HOST, () => {
  logger.info({ host: env.HOST, port: env.PORT }, "Avto Bozor API listening");
});

server.on("error", (error: NodeJS.ErrnoException) => {
  logger.error({ err: error }, "Failed to start HTTP server");
  process.exit(1);
});

void PrismaService.checkConnection().then((connected) => {
  if (connected) {
    logger.info("PostgreSQL connection established");
    return;
  }
  logger.error("PostgreSQL connection failed");
});

const shutdown = createShutdownHandler({
  server,
  disconnect: () => PrismaService.disconnect(),
});

function onSignal(signal: "SIGINT" | "SIGTERM"): void {
  logger.info({ signal }, "Shutting down");
  void shutdown(signal)
    .then(() => {
      process.exit(0);
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Shutdown failed";
      logger.error({ err: redactSensitiveText(message) }, "Shutdown failed");
      process.exit(1);
    });
}

process.on("SIGINT", () => {
  onSignal("SIGINT");
});

process.on("SIGTERM", () => {
  onSignal("SIGTERM");
});
