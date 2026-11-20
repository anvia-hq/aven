import { isBehind } from "./build";
import type { LatestRelease } from "./types";

export async function updateTarget(
  runner: { build: string | undefined; isControlPlane: boolean },
  server: string | undefined,
  latest: LatestRelease,
): Promise<string | null> {
  if (!server) {
    const newest = await latest.get();
    return isBehind(runner.build, newest) ? (newest ?? null) : null;
  }

  if (isBehind(runner.build, server)) return server;

  if (!runner.isControlPlane) return null;

  const newest = await latest.get();
  return isBehind(server, newest) ? (newest ?? null) : null;
}
