import { existsSync } from "node:fs";

type Env = Record<string, string | undefined>;

/**
 * The environment `systemctl --user` needs to find the person's systemd. It looks for the user
 * bus under `XDG_RUNTIME_DIR`, which a login session sets but a plain `ssh host 'aven update'`
 * does not, and then fails with "Failed to connect to bus". Without it, the directory systemd
 * makes for the user (`/run/user/<uid>`, kept while they linger) is given, if it is there.
 */
export function withUserBus(
  env: Env,
  uid: number | undefined,
  exists: (path: string) => boolean = existsSync,
): Env {
  if (env.XDG_RUNTIME_DIR || uid === undefined) return env;
  const runtimeDir = `/run/user/${uid}`;
  return exists(runtimeDir) ? { ...env, XDG_RUNTIME_DIR: runtimeDir } : env;
}
