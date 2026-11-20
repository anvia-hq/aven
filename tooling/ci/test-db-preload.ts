import { afterAll } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SQL } from "bun";

import { closeDefaultDatabase } from "../../packages/db/src/client";

const DB_NAME_PATTERN = /^[a-z0-9_]+$/;

const template = process.env.AVEN_TEST_DB_TEMPLATE;
const baseUrl = process.env.DATABASE_URL;

if (template && baseUrl) {
  if (!DB_NAME_PATTERN.test(template)) {
    throw new Error(`Invalid AVEN_TEST_DB_TEMPLATE: "${template}"`);
  }

  const workerDb = `aven_w_${process.pid}`;
  const marker = join(tmpdir(), `aven-test-db-${process.pid}`);

  if (!existsSync(marker)) {
    const adminUrl = new URL(baseUrl);
    adminUrl.pathname = "/postgres";
    const admin = new SQL(adminUrl.toString());
    try {
      await admin.unsafe("SELECT pg_advisory_lock(424242)");
      try {
        await admin.unsafe(`DROP DATABASE IF EXISTS ${workerDb} WITH (FORCE)`);
        await admin.unsafe(`CREATE DATABASE ${workerDb} TEMPLATE ${template}`);
      } finally {
        await admin.unsafe("SELECT pg_advisory_unlock(424242)");
      }
    } finally {
      await admin.close();
    }
    writeFileSync(marker, workerDb);
  }

  const workerUrl = new URL(baseUrl);
  workerUrl.pathname = `/${workerDb}`;
  process.env.DATABASE_URL = workerUrl.toString();

  afterAll(async () => {
    await closeDefaultDatabase();
  });
}
