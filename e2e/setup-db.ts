import { SQL } from "bun";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const target = new URL(url);
const dbName = target.pathname.slice(1);
if (!/^[a-z0-9_]+$/.test(dbName) || !dbName.endsWith("_e2e")) {
  throw new Error(`Refusing to recreate "${dbName}": e2e database names must end in _e2e`);
}

const admin = new URL(url);
admin.pathname = "/postgres";

const sql = new SQL(admin.toString());
await sql.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
await sql.unsafe(`CREATE DATABASE ${dbName}`);
await sql.close();

const migrate = Bun.spawn(["bun", "packages/db/src/migrate.ts"], {
  env: process.env,
  stdout: "inherit",
  stderr: "inherit",
});
if ((await migrate.exited) !== 0) throw new Error("migrations failed");
