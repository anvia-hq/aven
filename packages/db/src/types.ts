import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Sql } from "postgres";

export interface Database {
  sql: Sql;
  db: PostgresJsDatabase & { $client: Sql };
}
