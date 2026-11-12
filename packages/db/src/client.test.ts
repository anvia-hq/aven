import { describe, expect, test } from "bun:test";
import { sql as query } from "drizzle-orm";

const unreachable = "postgres://aven:aven@127.0.0.1:1/aven_missing";
const run = process.env.DATABASE_URL ? describe : describe.skip;

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;

  if (!url) throw new Error("DATABASE_URL is not set");

  return url;
}

run("database client (postgres)", () => {
  test("createDatabase answers a trivial query with the driver and with drizzle", async () => {
    const { createDatabase } = await import("./client");
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
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = unreachable;

    try {
      const { migrateDatabase } = await import("./migrate");
      await expect(migrateDatabase()).rejects.toThrow("Failed query");
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
  });
});
