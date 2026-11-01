import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { newServerEnv, type ServerEnvOptions } from "./env-file";

/**
 * Puts a server's files in `dir`. The compose file is the one this version of `aven` was built
 * with, so it is always written again; the `.env` holds the install's secrets, so an existing one is
 * never touched. Returns whether a new `.env` was made.
 */
export async function writeServerFiles(
  dir: string,
  files: { compose: string; envTemplate: string },
  options: ServerEnvOptions,
) {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "docker-compose.yml"), files.compose);

  const envPath = join(dir, ".env");
  const existing = await readFile(envPath, "utf8").catch(() => undefined);
  if (existing !== undefined) return false;
  // Readable by the owner only: it holds the database password and the keys.
  await writeFile(envPath, newServerEnv(files.envTemplate, options), { mode: 0o600 });
  await chmod(envPath, 0o600);
  return true;
}
