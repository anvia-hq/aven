import { isBehind } from "./build";
import type { LatestRelease } from "./types";

export async function updateTarget(
  runner: { build: string | undefined; isControlPlane: boolean },
  server: string | undefined,
  latest: LatestRelease,
): Promise<string | null> {
  if (isBehind(runner.build, server)) return server ?? null;

  if (!runner.isControlPlane || !server) return null;

  const newest = await latest.get();
  return isBehind(server, newest) ? (newest ?? null) : null;
}
