import { exec } from "./compose";

const REPOSITORIES = [
  "ghcr.io/anvia-hq/aven-server",
  "ghcr.io/anvia-hq/aven-web",
  "ghcr.io/anvia-hq/aven-sandbox",
];
const RELEASE_TAG = /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/;

/**
 * The images of other releases in a `docker images --format '{{.Repository}}:{{.Tag}}'` listing:
 * ours, tagged with an exact version that is not `current`, which must itself be a release.
 * `latest`, `0.1`, `dev` and images made by hand are left alone.
 */
export function staleImages(listing: string, current: string) {
  // Only a release has older ones: an update to a dev build or `latest` removes nothing, so trying
  // a build on a machine that has Aven installed leaves that install's images where they are.
  if (!RELEASE_TAG.test(current)) return [];
  return listing
    .split("\n")
    .map((line) => line.trim())
    .filter((image) => {
      const [repository, tag] = image.split(":");
      return (
        REPOSITORIES.includes(repository ?? "") && RELEASE_TAG.test(tag ?? "") && tag !== current
      );
    });
}

/**
 * Removes the images an update left behind: a sandbox image is several gigabytes. Docker refuses
 * one a container still uses, which is left as it is, and this never fails an update.
 */
export async function removeStaleImages(current: string) {
  try {
    const listing = await exec(["docker", "images", "--format", "{{.Repository}}:{{.Tag}}"]);
    if (listing.code !== 0) return;
    for (const image of staleImages(listing.out, current)) {
      if ((await exec(["docker", "image", "rm", image])).code === 0) {
        console.log(`Removed the old image ${image}`);
      }
    }
  } catch {
    // Cleaning up is not worth failing an update for.
  }
}
