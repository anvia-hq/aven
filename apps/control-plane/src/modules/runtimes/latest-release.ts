const RELEASES = "https://github.com/anvia-hq/aven/releases";
const FOUND_MS = 60 * 60_000;
const FAILED_MS = 5 * 60_000;
const ASK_MS = 5_000;

export type LatestRelease = { get(): Promise<string | undefined> };

/**
 * The newest release that is not a prerelease, as `aven update` finds it: GitHub answers
 * `/releases/latest` with a redirect to the tag's page, which needs no API and has no rate limit to
 * speak of (decision 0148). Asked at most once an hour, and again after five minutes when it could
 * not be asked; never throws, since the list of runners must not wait on GitHub.
 */
export function createLatestRelease({
  fetchFn = fetch,
  now = Date.now,
  url = process.env.AVEN_RELEASES_URL || RELEASES,
}: { fetchFn?: typeof fetch; now?: () => number; url?: string } = {}): LatestRelease {
  const base = url.replace(/\/+$/, "");
  let known: { version: string | undefined; until: number } | undefined;
  let asking: Promise<string | undefined> | undefined;

  async function ask() {
    const before = known?.version;
    try {
      const response = await fetchFn(`${base}/latest`, {
        redirect: "manual",
        signal: AbortSignal.timeout(ASK_MS),
      });
      const tag = /\/tag\/v?(\d+\.\d+\.\d+)$/.exec(response.headers.get("location") ?? "")?.[1];
      known = tag
        ? { version: tag, until: now() + FOUND_MS }
        : { version: before, until: now() + FAILED_MS };
    } catch {
      known = { version: before, until: now() + FAILED_MS };
    }
    return known.version;
  }

  const refresh = () => (asking ??= ask().finally(() => (asking = undefined)));

  return {
    async get() {
      if (!known) return refresh();
      if (known.until <= now()) void refresh();
      return known.version;
    },
  };
}
