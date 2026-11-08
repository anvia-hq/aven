import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Leftovers } from "./leftovers";
import type { CommandOutput } from "./types";

const IMAGE = "ghcr.io/anvia-hq/aven-sandbox:0.5.14";
const NOW = Date.parse("2026-11-08T00:00:00Z");

const ok = (stdout = ""): CommandOutput => ({ code: 0, stdout, stderr: "" });
const row = (...fields: string[]) => fields.join("|");

describe("the Docker leftovers of a runner", () => {
  let home: string;
  let commands: string[][];
  let refused: Set<string>;
  let busy: Set<string>;
  let extra: string[];

  const containers = [
    row("c1", "aven-sandbox-gone", "exited", "2026-11-01", "aven-env-a:latest", "me", "t-gone"),
    row("c2", "aven-sandbox-live", "running", "2026-11-07", IMAGE, "me", "t-live"),
    row("c3", "aven-sandbox-orphan", "running", "2026-11-07", IMAGE, "me", "t-orphan"),
    row("c4", "aven-sandbox-theirs", "exited", "2026-11-01", IMAGE, "other", "t-theirs"),
    row("c5", "aven-sandbox-old", "exited", "2026-11-01", IMAGE, "", "t-old"),
    row("c6", "aven-setup", "running", "2026-11-07", IMAGE, "me", ""),
  ].join("\n");

  const images = [
    row("i1", "<none>", "<none>", "1.2GB", "2026-10-01"),
    row("i2", "aven-env-a", "latest", "2GB", "2026-10-01"),
    row("i3", "aven-env-b", "latest", "2GB", "2026-10-01"),
    row("i4", "aven-env-c", "latest", "2GB", "2026-11-07"),
    row("i5", "ghcr.io/anvia-hq/aven-sandbox", "0.5.12", "3GB", "2026-10-01"),
    row("i6", "ghcr.io/anvia-hq/aven-sandbox", "0.5.14", "3GB", "2026-11-07"),
    row("i7", "postgres", "17", "400MB", "2026-10-01"),
  ].join("\n");

  const docker = async (args: string[]): Promise<CommandOutput> => {
    commands.push(args);
    if (args[0] === "ps") {
      return ok(args.includes("label=aven.sandbox") ? [containers, ...extra].join("\n") : "");
    }
    if (args[0] === "images") return ok(images);
    const ref = args.at(-1) ?? "";
    if (refused.has(ref)) return { code: 1, stdout: "", stderr: `${ref} is in use\n` };
    return ok();
  };

  const make = () =>
    new Leftovers({
      docker,
      runner: "me",
      image: IMAGE,
      home,
      now: () => NOW,
      inUse: (threadId) => busy.has(threadId),
    });

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "aven-leftovers-"));
    commands = [];
    refused = new Set();
    busy = new Set(["t-live"]);
    extra = [];
    await mkdir(join(home, "environments"), { recursive: true });
    await writeFile(join(home, "environments", "t-pinned.image"), "aven-env-a\n");
    await mkdir(join(home, "snapshots", "key-c"), { recursive: true });
    await writeFile(
      join(home, "snapshots", "key-c", "meta.json"),
      JSON.stringify({ image: "aven-env-c", baseImageId: "x", createdAt: "2026-11-06T00:00:00Z" }),
    );
  });

  afterEach(() => rm(home, { recursive: true, force: true }));

  test("lists stopped containers and ones no thread uses, never another runner's", async () => {
    const { containers: found } = await make().list();
    expect(found.map((container) => container.ref).sort()).toEqual(["c1", "c3", "c5"]);
    expect(found.find((container) => container.ref === "c3")?.reason).toContain("no thread");
  });

  test("lists untagged images, snapshots nothing keeps and images of older releases", async () => {
    const { images: found } = await make().list();
    expect(found.map((image) => image.ref).sort()).toEqual([
      "aven-env-b:latest",
      "ghcr.io/anvia-hq/aven-sandbox:0.5.12",
      "i1",
    ]);
  });

  test("an image a kept container runs on is not listed, however old", async () => {
    extra.push(row("c7", "aven-sandbox-old-image", "running", "2026-11-07", "i5", "me", "t-live"));
    const { images: found } = await make().list();
    expect(found.map((image) => image.ref)).not.toContain("ghcr.io/anvia-hq/aven-sandbox:0.5.12");
    expect(found.map((image) => image.ref)).toContain("aven-env-b:latest");
  });

  test("removes only what is listed, reports what Docker refuses and what is not a leftover", async () => {
    refused.add("c5");
    const result = await make().remove({
      containers: ["c1", "c2", "c5"],
      images: ["i1", "i7", "aven-env-b:latest"],
    });
    expect(result).toEqual({
      removedContainers: 1,
      removedImages: 2,
      failed: [
        { ref: "c2", reason: "It is not a leftover any more" },
        { ref: "c5", reason: "c5 is in use" },
        { ref: "i7", reason: "It is not a leftover any more" },
      ],
    });
    const removals = commands.filter((args) => args[0] === "rm" || args[0] === "rmi");
    expect(removals).toEqual([
      ["rm", "-f", "c1"],
      ["rm", "-f", "c5"],
      ["rmi", "i1"],
      ["rmi", "aven-env-b:latest"],
    ]);
  });
});
