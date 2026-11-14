import { exec } from "./compose";

const REPOSITORIES = [
  "ghcr.io/anvia-hq/aven-server",
  "ghcr.io/anvia-hq/aven-web",
  "ghcr.io/anvia-hq/aven-sandbox",
];
const RELEASE_TAG = /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/;

export function staleImages(listing: string, current: string) {
  if (!RELEASE_TAG.test(current)) return [];

  return listing.split("\n").flatMap((line) => {
    const image = line.trim();
    const [repository, tag] = image.split(":");
    return REPOSITORIES.includes(repository ?? "") && RELEASE_TAG.test(tag ?? "") && tag !== current
      ? [image]
      : [];
  });
}

export async function removeStaleImages(current: string) {
  try {
    const listing = await exec(["docker", "images", "--format", "{{.Repository}}:{{.Tag}}"]);

    if (listing.code !== 0) return;

    for (const image of staleImages(listing.out, current)) {
      if ((await exec(["docker", "image", "rm", image])).code === 0) {
        console.log(`Removed the old image ${image}`);
      }
    }
  } catch {}
}
