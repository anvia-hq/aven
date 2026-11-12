import { existsSync } from "node:fs";

type Env = Record<string, string | undefined>;

export function withUserBus(
  env: Env,
  uid: number | undefined,
  exists: (path: string) => boolean = existsSync,
): Env {
  if (env.XDG_RUNTIME_DIR || uid === undefined) return env;

  const runtimeDir = `/run/user/${uid}`;
  return exists(runtimeDir) ? { ...env, XDG_RUNTIME_DIR: runtimeDir } : env;
}
