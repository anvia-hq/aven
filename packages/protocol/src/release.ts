export const DEFAULT_RELEASES_URL = "https://github.com/anvia-hq/aven/releases";

export const SEMVER_RE = /^\d+\.\d+\.\d+$/;

export const RELEASE_TAG_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/;

export const VERSION_RE = /^\d+(\.\d+){0,2}$/;

export function releasesUrl(url: string | undefined = process.env.AVEN_RELEASES_URL) {
  return (url || DEFAULT_RELEASES_URL).replace(/\/+$/, "");
}

export function parseReleaseTag(
  location: string | null | undefined,
  options?: { strict?: boolean },
) {
  const pattern = options?.strict ? /\/tag\/v?(\d+\.\d+\.\d+)$/ : /\/tag\/v?([^/?#]+)$/;
  return pattern.exec(location ?? "")?.[1];
}

export function isValidRelease(value: string) {
  return RELEASE_TAG_RE.test(value);
}

const versionParts = (version: string) => version.split(".").map(Number);

export function isBehind(runner: string | undefined, server: string | undefined) {
  if (!runner || !server || !VERSION_RE.test(runner) || !VERSION_RE.test(server)) return false;

  const [a, b] = [versionParts(runner), versionParts(server)];
  for (let i = 0; i < 3; i++) {
    const [x, y] = [a[i] ?? 0, b[i] ?? 0];

    if (x !== y) return x < y;
  }
  return false;
}
