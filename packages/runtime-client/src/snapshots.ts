import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { PACKAGE_STORES } from "./local-excludes";
import { runCommand } from "./run-command";
import type { Snapshot } from "./types";

export const SNAPSHOT_MAX_AGE_MS = 72 * 60 * 60 * 1000;

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

async function cloneDirectory(from: string, to: string) {
  if (process.platform !== "darwin") return false;
  try {
    await mkdir(dirname(to), { recursive: true });
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

export class SnapshotStore {
  constructor(
    private root: string,
    private now: () => number = Date.now,
  ) {}

  keyFor(organizationId: string, cloneUrl: string) {
    return createHash("sha256").update(`${organizationId}\n${cloneUrl}`).digest("hex").slice(0, 24);
  }

  imageFor(key: string) {
    return `aven-env-${key}`;
  }

  #dir(key: string) {
    return join(this.root, key);
  }

  logPath(key: string) {
    return join(this.root, `${key}.setup.log`);
  }

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

  async publish(
    key: string,
    input: { image: string; baseImageId: string; workspace: string },
  ): Promise<Snapshot> {
    await mkdir(this.root, { recursive: true });
    const building = join(this.root, `${key}.building-${randomBytes(4).toString("hex")}`);
    try {
      await copyTree(input.workspace, join(building, "workspace"));
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

  restore(snapshot: Snapshot, to: string) {
    return copyTree(snapshot.workspace, to);
  }

  async remove(key: string) {
    await rm(this.#dir(key), { recursive: true, force: true });
  }
}
