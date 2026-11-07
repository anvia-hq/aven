import { isBehind } from "./build";
import type { LatestRelease } from "./latest-release";

/**
 * The release a runner can be updated to, or null when none (decision 0148). Other runners follow
 * the server: they go to its release when they are behind it. The control plane's own runner is on
 * the server's machine and its update is the server's too, so when the server is behind the newest
 * release on GitHub, it goes there.
 */
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
