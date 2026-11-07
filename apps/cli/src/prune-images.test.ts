import { describe, expect, test } from "bun:test";

import { staleImages } from "./prune-images";

const listing = [
  "ghcr.io/anvia-hq/aven-server:0.1.2",
  "ghcr.io/anvia-hq/aven-server:0.1.1",
  "ghcr.io/anvia-hq/aven-web:0.1.0",
  "ghcr.io/anvia-hq/aven-sandbox:0.1.1",
  "ghcr.io/anvia-hq/aven-sandbox:0.2.0-rc.1",
  "ghcr.io/anvia-hq/aven-server:latest",
  "ghcr.io/anvia-hq/aven-server:0.1",
  "ghcr.io/anvia-hq/aven-server:dev",
  "aven-server:0.0.9",
  "postgres:17-alpine",
  "<none>:<none>",
  "",
].join("\n");

describe("the images an update leaves behind", () => {
  test("are ours, tagged with another release's exact version", () => {
    expect(staleImages(listing, "0.1.2")).toEqual([
      "ghcr.io/anvia-hq/aven-server:0.1.1",
      "ghcr.io/anvia-hq/aven-web:0.1.0",
      "ghcr.io/anvia-hq/aven-sandbox:0.1.1",
      "ghcr.io/anvia-hq/aven-sandbox:0.2.0-rc.1",
    ]);
  });

  test("never include the current release, a moving tag, a dev build or another repository", () => {
    const stale = staleImages(listing, "0.1.2");
    for (const kept of ["0.1.2", ":latest", ":0.1", ":dev"]) {
      expect(stale.some((image) => image.endsWith(kept))).toBe(false);
    }
    expect(stale).not.toContain("aven-server:0.0.9");
    expect(stale).not.toContain("postgres:17-alpine");
  });

  test("are none when the update is to a dev build or `latest`, which have no older release", () => {
    for (const current of ["dev", "latest", "0.1", ""])
      expect(staleImages(listing, current)).toEqual([]);
  });
});
