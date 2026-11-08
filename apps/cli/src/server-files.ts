import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { stringFlag } from "./args";
import { newServerEnv, parseEnv, setEnv } from "./env-file";
import type { Args, ServerEnvOptions } from "./types";

type EnvChange = { key: string; from: string | undefined; to: string };

function fill(values: Record<string, string>, key: string, value: string) {
  if (values[key] === undefined) values[key] = value;
}

export function installEnvValues(args: Args, options: ServerEnvOptions) {
  const values: Record<string, string> = {};
  const port = stringFlag(args, "port");
  const httpsPort = stringFlag(args, "https-port");
  const apiPort = stringFlag(args, "api-port");
  const domain = stringFlag(args, "domain");
  const bind = stringFlag(args, "bind");
  const origin = stringFlag(args, "origin");
  const ownerEmail = stringFlag(args, "owner-email");
  const release = stringFlag(args, "release");

  if (port !== undefined) values.AVEN_PORT = port;
  if (httpsPort !== undefined) values.AVEN_HTTPS_PORT = httpsPort;
  if (apiPort !== undefined) values.AVEN_API_PORT = apiPort;
  if (bind !== undefined) values.AVEN_BIND = bind;
  if (domain !== undefined) values.AVEN_SITE_ADDRESS = domain;
  if (ownerEmail !== undefined) values.PLATFORM_OWNER_EMAILS = ownerEmail;
  if (release !== undefined) values.AVEN_VERSION = release;
  if (origin !== undefined) {
    values.BETTER_AUTH_URL = origin;
    values.TRUSTED_ORIGINS = origin;
  }
  if (domain !== undefined) {
    fill(values, "AVEN_PORT", String(options.port));
    fill(values, "AVEN_HTTPS_PORT", String(options.httpsPort ?? 443));
    values.AVEN_HTTPS_BIND = "0.0.0.0";
    fill(values, "AVEN_BIND", options.bind ?? "0.0.0.0");
    fill(values, "BETTER_AUTH_URL", options.origin);
    fill(values, "TRUSTED_ORIGINS", options.origin);
  }
  return values;
}

export function envChangeLines(changed: EnvChange[]) {
  return changed.map(({ key, from, to }) => `${key}: ${from ?? "unset"} -> ${to}`);
}

export async function writeServerFiles(
  dir: string,
  files: { compose: string; envTemplate: string },
  options: ServerEnvOptions,
  values: Record<string, string> = {},
): Promise<{ created: boolean; changed: EnvChange[] }> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "docker-compose.yml"), files.compose);

  const envPath = join(dir, ".env");
  const existing = await readFile(envPath, "utf8").catch(() => undefined);
  if (existing === undefined) {
    await writeFile(envPath, newServerEnv(files.envTemplate, options), { mode: 0o600 });
    await chmod(envPath, 0o600);
    return { created: true, changed: [] };
  }

  const before = parseEnv(existing);
  const updated = setEnv(existing, values);
  const after = parseEnv(updated);
  const changed = Object.keys(values)
    .filter((key) => after[key] !== before[key])
    .map((key) => ({ key, from: before[key], to: after[key]! }));
  if (changed.length > 0) {
    await writeFile(envPath, updated);
    await chmod(envPath, 0o600);
  }
  return { created: false, changed };
}
