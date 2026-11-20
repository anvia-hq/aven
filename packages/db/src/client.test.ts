import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

import { sql as query } from "drizzle-orm";

import { createDatabase } from "./client";
import { migrateDatabase } from "./migrate";

const unreachable = "postgres://aven:aven@127.0.0.1:1/aven_missing";
const run = process.env.DATABASE_URL ? describe : describe.skip;
const clientPath = fileURLToPath(new URL("./client.ts", import.meta.url));

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;

  if (!url) throw new Error("DATABASE_URL is not set");

  return url;
}

function envWithoutDatabaseUrl(): Record<string, string> {
  const entries = Object.entries(process.env).flatMap(([key, value]) =>
    key === "DATABASE_URL" || value === undefined ? [] : [[key, value] as const],
  );
  return Object.fromEntries(entries);
}

describe("database client (unit)", () => {
  test("importing client without DATABASE_URL does not throw until db or sql is used", () => {
    const script = [
      `const mod = await import(${JSON.stringify(clientPath)});`,
      `if (typeof mod.createDatabase !== "function") throw new Error("missing createDatabase");`,
      `let dbError = "";`,
      `try { void mod.db.select; } catch (error) { dbError = error instanceof Error ? error.message : String(error); }`,
      `let sqlError = "";`,
      `try { mod.sql\`select 1\`; } catch (error) { sqlError = error instanceof Error ? error.message : String(error); }`,
      `console.log(JSON.stringify({ dbError, sqlError }));`,
    ].join(" ");

    const result = Bun.spawnSync([process.execPath, "-e", script], {
      cwd: "/tmp",
      env: envWithoutDatabaseUrl(),
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout.toString().trim()) as {
      dbError: string;
      sqlError: string;
    };
    expect(output.dbError).toBe("DATABASE_URL is not set");
    expect(output.sqlError).toBe("DATABASE_URL is not set");
  });

  test("createDatabase constructs a client bound to the given url", async () => {
    const { sql, db } = createDatabase(unreachable);
    try {
      expect(db.$client).toBe(sql);
    } finally {
      await sql.end({ timeout: 0 });
    }
  });

  test("migrateDatabase rejects when url is missing", async () => {
    await expect(migrateDatabase("")).rejects.toThrow("DATABASE_URL is not set");
  });
});

run("database client (postgres)", () => {
  test("createDatabase answers a trivial query with the driver and with drizzle", async () => {
    const { sql, db } = createDatabase(databaseUrl());

    try {
      expect(db.$client).toBe(sql);

      const [row] = await sql`select 1 as value`;
      expect(row.value).toBe(1);

      const rows = await db.execute<{ value: number }>(query`select 2 as value`);
      expect(rows[0]?.value).toBe(2);
    } finally {
      await sql.end();
    }
  });

  test("the client the module exports answers a trivial query", async () => {
    const { sql, db } = await import("./client");

    const [row] = await sql`select 3 as value`;
    expect(row.value).toBe(3);

    const rows = await db.execute<{ value: number }>(query`select 4 as value`);
    expect(rows[0]?.value).toBe(4);
  });

  test("importing migrate.ts does not migrate, and migrateDatabase migrates the database it is given", async () => {
    const previous = databaseUrl();
    process.env.DATABASE_URL = unreachable;

    try {
      const imported = await import("./migrate");
      process.env.DATABASE_URL = previous;
      await expect(imported.migrateDatabase(unreachable)).rejects.toThrow("Failed query");
    } finally {
      process.env.DATABASE_URL = previous;
    }
  });
});
