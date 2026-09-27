import dotenv from "dotenv";
import { defineConfig } from "vitest/config";
import { toTestDatabaseUrl } from "./src/config/test-database-url.js";

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required. Tests use the local avto_bozor_test database.");
}

const databaseUrl = toTestDatabaseUrl(process.env.DATABASE_URL);

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    clearMocks: true,
    restoreMocks: true,
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      HOST: "127.0.0.1",
      PORT: "3000",
      DATABASE_URL: databaseUrl,
      JWT_SECRET: "test-access-secret-must-be-32-characters",
      JWT_REFRESH_SECRET: "test-refresh-secret-must-be-32-characters",
      JWT_EXPIRES_IN: "15m",
      JWT_REFRESH_EXPIRES_IN: "7d",
      CORS_ORIGIN: "http://localhost:5173",
      RATE_LIMIT_WINDOW_MS: "900000",
      RATE_LIMIT_MAX: "300",
      TRUST_PROXY: "false",
      LOG_LEVEL: "silent",
    },
  },
});
