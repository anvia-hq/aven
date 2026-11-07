import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { PACKAGE_STORES } from "./local-excludes";
import { runCommand } from "./run-command";

/** A snapshot is used for this long, then the next thread that needs one makes a new one (decision 0043). */
export const SNAPSHOT_MAX_AGE_MS = 72 * 60 * 60 * 1000;

/** What a repository's setup made on this runner: a Docker image and a copy of the workspace. */
export type Snapshot = {
  key: string;
  /** The Docker image made from the setup container. */
  image: string;
  /** The id of the sandbox image the setup container started from; a snapshot of another is not used. */
  baseImageId: string;
  createdAt: string;
  /** The workspace as setup left it. */
  workspace: string;
  /** What setup wrote. */
  logPath: string;
};

type Meta = Pick<Snapshot, "image" | "baseImageId" | "createdAt">;

const isMeta = (value: unknown): value is Meta => {
  const meta = value as Partial<Meta> | null;
  return (
    typeof meta?.image === "string" &&
    typeof meta.baseImageId === "string" &&
    typeof meta.createdAt === "string" &&
    !Number.isNaN(Date.parse(meta.createdAt))
  );
};

// APFS copies a whole directory tree in one `clonefile` call, as the Finder does, where `cp -c` makes
// one call for each of a project's tens of thousands of files in `node_modules` and takes seconds
// (decision 0127). Only for a destination that does not exist, which is made again for the plain
// copy when this cannot be done (another file system, or not macOS).
async function cloneDirectory(from: string, to: string) {
  if (process.platform !== "darwin") return false;
  try {
    await mkdir(dirname(to), { recursive: true });
    // An empty directory is made as it was needed, and `clonefile` wants none; a full one stays and
    // is left to the plain copy.
    await rmdir(to).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
    const { dlopen, FFIType } = await import("bun:ffi");
    const { symbols } = dlopen("libSystem.B.dylib", {
      clonefile: { args: [FFIType.cstring, FFIType.cstring, FFIType.u32], returns: FFIType.i32 },
    });
    return symbols.clonefile(Buffer.from(`${from}\0`), Buffer.from(`${to}\0`), 0) === 0;
  } catch {
    return false;
  }
}

// A copy that shares the disk blocks where the file system can (APFS, btrfs, xfs), and a plain one
// where it cannot: a project with a large `node_modules` should not be written twice.
export async function copyTree(from: string, to: string) {
  if (await cloneDirectory(from, to)) return;
  await mkdir(to, { recursive: true });
  const attempts =
    process.platform === "darwin"
      ? [
          ["cp", "-cpPR"],
          ["cp", "-pPR"],
        ]
      : [
          ["cp", "-a", "--reflink=auto"],
          ["cp", "-a"],
        ];
  let last = "";
  for (const command of attempts) {
    const copied = await runCommand([...command, `${from}/.`, to]);
    if (copied.code === 0) return;
    last = copied.stderr.trim();
  }
  throw new Error(`Could not copy ${from}: ${last}`);
}

// The snapshots of a runner (decision 0043), one folder each in `<root>/<key>/`: `meta.json`,
// `workspace/` and `setup.log`. A folder without `meta.json` is not a snapshot.
export class SnapshotStore {
  constructor(
    private root: string,
    private now: () => number = Date.now,
  ) {}

  /** The same repository of the same organization always has the same key. */
  keyFor(organizationId: string, cloneUrl: string) {
    return createHash("sha256").update(`${organizationId}\n${cloneUrl}`).digest("hex").slice(0, 24);
  }

  /** The Docker image name of a key's snapshot. */
  imageFor(key: string) {
    return `aven-env-${key}`;
  }

  #dir(key: string) {
    return join(this.root, key);
  }

  /** Where the output of a setup for `key` is written, whether or not it made a snapshot. */
  logPath(key: string) {
    return join(this.root, `${key}.setup.log`);
  }

  /** The snapshot for `key` when it is whole, not too old and made from `baseImageId`; else null. */
  async valid(key: string, baseImageId: string): Promise<Snapshot | null> {
    const dir = this.#dir(key);
    const meta: unknown = await readFile(join(dir, "meta.json"), "utf8")
      .then((text) => JSON.parse(text) as unknown)
      .catch(() => null);
    if (!isMeta(meta)) return null;
    const age = this.now() - Date.parse(meta.createdAt);
    if (age < 0 || age > SNAPSHOT_MAX_AGE_MS || meta.baseImageId !== baseImageId) return null;
    return { key, ...meta, workspace: join(dir, "workspace"), logPath: this.logPath(key) };
  }

  /**
   * Keeps a copy of `workspace` and the image made from the setup, replacing the key's snapshot.
   * It is built beside the old one and moved into place, so a runner that stops halfway leaves
   * either the old snapshot or none, never half of a new one.
   */
  async publish(
    key: string,
    input: { image: string; baseImageId: string; workspace: string },
  ): Promise<Snapshot> {
    await mkdir(this.root, { recursive: true });
    const building = join(this.root, `${key}.building-${randomBytes(4).toString("hex")}`);
    try {
      await copyTree(input.workspace, join(building, "workspace"));
      // A package manager's store can be hundreds of megabytes and is only a cache: the installed
      // `node_modules` beside it are what a thread needs, so it is not kept.
      await Promise.all(
        PACKAGE_STORES.map((name) =>
          rm(join(building, "workspace", name), { recursive: true, force: true }),
        ),
      );
      const meta: Meta = {
        image: input.image,
        baseImageId: input.baseImageId,
        createdAt: new Date(this.now()).toISOString(),
      };
      await writeFile(join(building, "meta.json"), JSON.stringify(meta));
      await rm(this.#dir(key), { recursive: true, force: true });
      await rename(building, this.#dir(key));
      return {
        key,
        ...meta,
        workspace: join(this.#dir(key), "workspace"),
        logPath: this.logPath(key),
      };
    } catch (error) {
      await rm(building, { recursive: true, force: true });
      throw error;
    }
  }

  /** Puts a copy of the snapshot's workspace in `to`, which must be empty or not exist yet. */
  restore(snapshot: Snapshot, to: string) {
    return copyTree(snapshot.workspace, to);
  }

  async remove(key: string) {
    await rm(this.#dir(key), { recursive: true, force: true });
  }
}
