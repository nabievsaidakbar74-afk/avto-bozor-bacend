import { spawnSync } from "node:child_process";
import dotenv from "dotenv";
import { Client } from "pg";
import { toTestDatabaseUrl } from "../src/config/test-database-url.js";

dotenv.config();

const TEST_DATABASE_NAME = "avto_bozor_test";

function redact(error: unknown): Error {
  const message = error instanceof Error ? error.message : "Test database setup failed";
  return new Error(message.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]"));
}

const configured = process.env.DATABASE_URL;
if (!configured) {
  throw new Error("DATABASE_URL is required to prepare the test database");
}

const testUrl = toTestDatabaseUrl(configured);
const maintenance = new URL(configured);
maintenance.pathname = "/avto_bozor";

const client = new Client({ connectionString: maintenance.toString() });

try {
  await client.connect();
  const existing = await client.query<{ datname: string }>(
    "SELECT datname FROM pg_database WHERE datname = $1",
    [TEST_DATABASE_NAME],
  );
  if (existing.rowCount === 0) {
    await client.query(`CREATE DATABASE "${TEST_DATABASE_NAME}"`);
  }
} catch (error) {
  throw redact(error);
} finally {
  await client.end().catch(() => undefined);
}

const migrated = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  env: { ...process.env, DATABASE_URL: testUrl },
  stdio: "inherit",
  shell: true,
});

if (migrated.status !== 0) {
  process.exit(migrated.status ?? 1);
}
