import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { BrowserProfile, BrowserProfilesOptions } from "./types";
import type { ThreadRef } from "./types";

export const BROWSER_PROFILE_DIR = "/browser-profile";

const SAFE_NAME = /^[\w-]+$/;
const LOCKS = ["SingletonLock", "SingletonSocket", "SingletonCookie"];

const read = (path: string) => readFile(path, "utf8").catch(() => "");

export class BrowserProfiles {
  #held = new Map<string, string>();
  #keys = new Map<string, string>();

  constructor(private options: BrowserProfilesOptions) {}

  #path(...parts: string[]) {
    return join(this.options.home, "browser-profiles", ...parts);
  }

  #now() {
    return (this.options.now ?? Date.now)();
  }

  async remember(thread: ThreadRef) {
    if (!SAFE_NAME.test(thread.id) || !thread.ownerId || !thread.projectId) return;
    const name = `p-${createHash("sha256")
      .update(`${thread.ownerId}\n${thread.projectId}`)
      .digest("hex")
      .slice(0, 32)}`;
    if (this.#keys.get(thread.id) === name) return;
    this.#keys.set(thread.id, name);
    await mkdir(this.#path("keys"), { recursive: true, mode: 0o700 });
    await writeFile(this.#path("keys", thread.id), name);
  }

  async lease(threadId: string): Promise<BrowserProfile | undefined> {
    if (!SAFE_NAME.test(threadId)) return undefined;
    const held = this.#held.get(threadId);
    if (held) return { name: held, dir: this.#path(held), shared: held.startsWith("p-") };
    const key = this.#keys.get(threadId) ?? (await read(this.#path("keys", threadId))).trim();
    const taken = new Set(this.#held.values());
    const shared = key !== "" && SAFE_NAME.test(key) && !taken.has(key);
    const name = shared ? key : `t-${threadId}`;
    this.#held.set(threadId, name);
    const dir = this.#path(name);
    try {
      await mkdir(dir, { recursive: true, mode: 0o700 });
      if (shared) await Promise.all(LOCKS.map((lock) => rm(join(dir, lock), { force: true })));
      await writeFile(join(dir, ".aven-used"), new Date(this.#now()).toISOString());
    } catch (error) {
      this.#held.delete(threadId);
      throw error;
    }
    return { name, dir, shared };
  }

  release(threadId: string) {
    this.#held.delete(threadId);
  }

  async forget(threadId: string) {
    if (!SAFE_NAME.test(threadId)) return;
    this.#held.delete(threadId);
    this.#keys.delete(threadId);
    await Promise.all([
      rm(this.#path("t-" + threadId), { recursive: true, force: true }),
      rm(this.#path("keys", threadId), { force: true }),
    ]);
  }

  async sweep() {
    const removed: string[] = [];
    const { keepMs } = this.options;
    if (keepMs <= 0) return removed;
    const leased = new Set(this.#held.values());
    const names = await readdir(this.#path()).catch(() => [] as string[]);
    for (const name of names) {
      if (!name.startsWith("p-") || !SAFE_NAME.test(name) || leased.has(name)) continue;
      const used = Date.parse(await read(this.#path(name, ".aven-used")));
      const since = Number.isNaN(used)
        ? await stat(this.#path(name)).then(
            (info) => info.mtimeMs,
            () => this.#now(),
          )
        : used;
      if (this.#now() - since < keepMs) continue;
      await rm(this.#path(name), { recursive: true, force: true });
      removed.push(name);
    }
    return removed;
  }
}
