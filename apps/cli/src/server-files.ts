import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { newServerEnv, type ServerEnvOptions } from "./env-file";

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
  await writeFile(envPath, newServerEnv(files.envTemplate, options), { mode: 0o600 });
  await chmod(envPath, 0o600);
  return true;
}
