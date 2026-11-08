import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { SNAPSHOT_MAX_AGE_MS } from "./snapshots";
import type { ArchivedCleanupOptions } from "./types";

const SAFE_NAME = /^[\w-]+$/;

const read = (path: string) => readFile(path, "utf8").catch(() => "");

export class ArchivedCleanup {
  constructor(private options: ArchivedCleanupOptions) {}

  #path(...parts: string[]) {
    return join(this.options.home, ...parts);
  }

  #now() {
    return (this.options.now ?? Date.now)();
  }

  async mark(threadId: string) {
    if (!SAFE_NAME.test(threadId)) return;
    await mkdir(this.#path("archived"), { recursive: true });
    await writeFile(this.#path("archived", threadId), new Date(this.#now()).toISOString());
  }

  async clear(threadId: string) {
    if (!SAFE_NAME.test(threadId)) return;
    await rm(this.#path("archived", threadId), { force: true });
  }

  async sweep() {
    const removed: string[] = [];
    if (this.options.keepMs > 0) {
      const marked = await readdir(this.#path("archived")).catch(() => [] as string[]);
      for (const threadId of marked) {
        if (!SAFE_NAME.test(threadId) || this.options.inUse(threadId)) continue;
        const since = Date.parse(await read(this.#path("archived", threadId)));
        if (Number.isNaN(since) || this.#now() - since < this.options.keepMs) continue;
        await this.#remove(threadId);
        removed.push(threadId);
      }
    }
    await this.#pruneEnvironments();
    return removed;
  }

  async #remove(threadId: string) {
    await Promise.all([
      rm(this.#path("workspaces", threadId), { recursive: true, force: true }),
      rm(this.#path("environments", `${threadId}.image`), { force: true }),
      rm(this.#path("skills", "threads", threadId), { recursive: true, force: true }),
    ]);
    await this.clear(threadId);
  }

  async #pinned() {
    const files = await readdir(this.#path("environments")).catch(() => [] as string[]);
    const images = await Promise.all(
      files
        .filter((file) => file.endsWith(".image"))
        .map((file) => read(this.#path("environments", file))),
    );
    return new Set(images.map((image) => image.trim()).filter((image) => image !== ""));
  }

  async #pruneEnvironments() {
    const keys = await readdir(this.#path("snapshots")).catch(() => [] as string[]);
    const pinned = await this.#pinned();
    for (const key of keys) {
      if (!SAFE_NAME.test(key) || key.includes(".")) continue;
      const meta = await this.#meta(key);
      const expired = !meta || this.#now() - Date.parse(meta.createdAt) > SNAPSHOT_MAX_AGE_MS;
      if (!expired) continue;
      const image = meta?.image ?? `aven-env-${key}`;
      if (pinned.has(image)) continue;
      const removed = await this.options.docker(["rmi", image]);
      const gone = removed.code === 0 || /No such image/i.test(removed.stderr);
      if (!gone) continue;
      await Promise.all([
        rm(this.#path("snapshots", key), { recursive: true, force: true }),
        rm(this.#path("snapshots", `${key}.setup.log`), { force: true }),
        rm(this.#path("spares", key), { recursive: true, force: true }),
      ]);
    }
  }

  async #meta(key: string) {
    try {
      const meta = JSON.parse(await read(this.#path("snapshots", key, "meta.json"))) as {
        image?: unknown;
        createdAt?: unknown;
      };
      if (typeof meta.image !== "string" || typeof meta.createdAt !== "string") return null;
      if (Number.isNaN(Date.parse(meta.createdAt))) return null;
      return { image: meta.image, createdAt: meta.createdAt };
    } catch {
      return null;
    }
  }
}
