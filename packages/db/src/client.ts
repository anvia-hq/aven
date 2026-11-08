import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import type { Database } from "./types";

export function createDatabase(url: string): Database {
  const sql = postgres(url);
  return { sql, db: drizzle(sql) };
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const database = createDatabase(url);

export const sql = database.sql;
export const db = database.db;
