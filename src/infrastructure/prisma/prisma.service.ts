import { PrismaClient } from "@prisma/client";
import { env } from "../../config/env.js";
import { logger, redactSensitiveText } from "../../config/logger.js";
import { withTimeout } from "../../common/utils/with-timeout.js";

const globalForPrisma = globalThis as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log: [{ emit: "event", level: "error" }],
  });
  client.$on("error", (event) => {
    logger.error(redactSensitiveText(event.message));
  });
  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

const HEALTH_CHECK_TIMEOUT_MS = 2_000;

function sanitizeDbError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown database error";
  return redactSensitiveText(message);
}

export class PrismaService {
  static client(): PrismaClient {
    return prisma;
  }

  static async connect(): Promise<void> {
    await prisma.$connect();
  }

  static async disconnect(): Promise<void> {
    await prisma.$disconnect();
  }

  static async checkConnection(): Promise<boolean> {
    try {
      await withTimeout(prisma.$queryRaw`SELECT 1`, HEALTH_CHECK_TIMEOUT_MS);
      return true;
    } catch (error) {
      logger.error({ err: sanitizeDbError(error) }, "Database health check failed");
      return false;
    }
  }
}
