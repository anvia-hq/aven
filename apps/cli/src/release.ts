import { chmod, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { exec } from "./compose";

/** Where releases live. `AVEN_RELEASES_URL` points a fork, or a test, somewhere else. */
const releasesUrl = () =>
  (process.env.AVEN_RELEASES_URL ?? "https://github.com/anvia-hq/aven/releases").replace(/\/$/, "");

/** The name the release gives this machine's build: darwin-arm64, darwin-amd64, linux-amd64 or linux-arm64. */
export function platformName(os: string = process.platform, arch: string = process.arch) {
  const names: Record<string, string> = { x64: "amd64", arm64: "arm64" };
  if ((os !== "darwin" && os !== "linux") || !names[arch])
    throw new Error(`There is no aven build for ${os} on ${arch}.`);
  return `${os}-${names[arch]}`;
}

export const assetName = (version: string, platform: string) =>
  `aven-${version}-${platform}.tar.gz`;

const downloadUrl = (version: string, file: string) =>
  `${releasesUrl()}/download/v${version}/${file}`;

/**
 * The newest release that is not a prerelease. GitHub answers `/releases/latest` with a redirect to
 * the tag's page; reading that avoids the API and its rate limit for people who are not signed in.
 */
export async function latestVersion(fetchFn: typeof fetch = fetch) {
  const response = await fetchFn(`${releasesUrl()}/latest`, { redirect: "manual" });
  const tag = /\/tag\/v?([^/?#]+)$/.exec(response.headers.get("location") ?? "")?.[1];
  if (!tag) throw new Error(`Could not find the latest release at ${releasesUrl()}.`);
  return tag;
}

/** The hash of each file in a `sha256sum` listing. */
export function parseChecksums(text: string) {
  const hashes: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const match = /^([0-9a-f]{64}) [ *](.+)$/.exec(line.trim());
    if (match) hashes[match[2]!] = match[1]!;
  }
  return hashes;
}

const sha256 = (bytes: Uint8Array) => new Bun.CryptoHasher("sha256").update(bytes).digest("hex");

/** Downloads this machine's build of a release and checks it against the release's checksums. */
export async function downloadVerified(
  version: string,
  platform: string,
  fetchFn: typeof fetch = fetch,
) {
  const file = assetName(version, platform);
  const get = async (name: string) => {
    const response = await fetchFn(downloadUrl(version, name));
    if (!response.ok)
      throw new Error(
        `Could not download ${name} (${response.status}). Does release v${version} exist?`,
      );
    return new Uint8Array(await response.arrayBuffer());
  };
  const [checksums, archive] = await Promise.all([get("checksums.txt"), get(file)]);
  const expected = parseChecksums(new TextDecoder().decode(checksums))[file];
  if (!expected) throw new Error(`checksums.txt of v${version} does not list ${file}.`);
  if (sha256(archive) !== expected)
    throw new Error(`${file} does not match its checksum. Nothing was installed.`);
  return archive;
}

/** Replaces the program at `target` with the `aven` inside a release archive. The new file is made beside it, so the swap is one rename and a running copy is not disturbed. */
export async function installBinary(archive: Uint8Array, target: string) {
  const work = await mkdtemp(join(dirname(target), ".aven-update-"));
  try {
    await writeFile(join(work, "aven.tar.gz"), archive);
    const unpacked = await exec(["tar", "-xzf", join(work, "aven.tar.gz"), "-C", work]);
    if (unpacked.code !== 0) throw new Error(`Could not unpack the release: ${unpacked.out}`);
    await chmod(join(work, "aven"), 0o755);
    await rename(join(work, "aven"), target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EACCES")
      throw new Error(
        `Cannot write ${target}. Run the update with sudo, or install aven somewhere you own.`,
      );
    throw error;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
