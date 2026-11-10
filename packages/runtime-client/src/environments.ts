import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { SETUP_SCRIPT, hostUser, scriptState, setupEnvironment } from "./environment-setup";
import { fetchBranch } from "./fetch-branch";
import { forkWorkspace } from "./fork-workspace";
import { clearDirectory, cloneRepository } from "./git-clone";
import { updateRestoredWorkspace } from "./restore-workspace";
import { SnapshotStore } from "./snapshots";
import type { RepoAccess } from "@aven/protocol/types";
import type { EnvironmentsConfig, ThreadRef } from "./types";

const SPARES_KEPT = 3;
const DEFAULT_SPARE_DELAY_MS = 5_000;

export class Environments {
  readonly snapshots: SnapshotStore;
  #config: EnvironmentsConfig;
  #turns = new Map<string, Promise<unknown>>();
  #warming = new Set<Promise<unknown>>();

  constructor(config: EnvironmentsConfig) {
    this.#config = config;
    this.snapshots = new SnapshotStore(join(config.home, "snapshots"));
  }

  async fill(thread: ThreadRef, root: string, access: RepoAccess) {
    const environment = await this.#environmentOf(thread, access);
    if (!environment) {
      await cloneRepository(root, thread.id, access, this.#config.git);
      return;
    }
    await this.#inTurn(environment.key, () => this.#fill(thread.id, root, access, environment));
    this.#warmLater(environment, access);
  }

  async fork(thread: ThreadRef, parentRoot: string, parentId: string, root: string) {
    await forkWorkspace(parentRoot, root, thread.id, this.#config.git);
    const pinned = (await readFile(this.#imageFile(parentId), "utf8").catch(() => "")).trim();
    if (pinned) await this.#pinImage(thread.id, pinned);
  }

  async settled() {
    while (this.#warming.size > 0) await Promise.allSettled(this.#warming);
  }

  async save(thread: ThreadRef, root: string, access: RepoAccess) {
    const environment = await this.#environmentOf(thread, access);
    if (!environment)
      throw new Error("Environments cannot be saved here: the sandbox image is not known");
    const state = await scriptState(root, SETUP_SCRIPT);
    if (state === "missing") {
      throw new Error(
        `The repository has no ${SETUP_SCRIPT}: write one, then save the environment`,
      );
    }
    if (state === "not-executable") {
      throw new Error(`${SETUP_SCRIPT} is not executable: run chmod +x ${SETUP_SCRIPT}`);
    }
    return this.#inTurn(environment.key, () =>
      this.#build(thread.id, root, environment.key, environment.baseImageId),
    );
  }

  async savedAt(thread: { organizationId?: string }, access: RepoAccess) {
    const environment = await this.#environmentOf(thread, access);
    if (!environment) return null;
    const snapshot = await this.snapshots.valid(environment.key, environment.baseImageId);
    return snapshot?.createdAt ?? null;
  }

  async imageOf(threadId: string) {
    const pinned = await readFile(this.#imageFile(threadId), "utf8").catch(() => "");
    return pinned.trim() || this.#config.image;
  }

  async #environmentOf(thread: { organizationId?: string }, access: RepoAccess) {
    if (!thread.organizationId) return null;
    const inspected = await this.#config.docker([
      "image",
      "inspect",
      "--format",
      "{{.Id}}",
      this.#config.image,
    ]);
    const baseImageId = inspected.code === 0 ? inspected.stdout.trim() : "";
    if (!baseImageId) return null;
    return { key: this.snapshots.keyFor(thread.organizationId, access.cloneUrl), baseImageId };
  }

  #inTurn<T>(key: string, work: () => Promise<T>) {
    const turn = (this.#turns.get(key) ?? Promise.resolve()).catch(() => undefined).then(work);
    this.#turns.set(key, turn);
    return turn.finally(() => {
      if (this.#turns.get(key) === turn) this.#turns.delete(key);
    });
  }

  async #fill(
    threadId: string,
    root: string,
    access: RepoAccess,
    { key, baseImageId }: { key: string; baseImageId: string },
  ) {
    const snapshot = await this.snapshots.valid(key, baseImageId);
    if (snapshot) {
      try {
        if (!(await this.#claimSpare(key, snapshot.createdAt, root))) {
          await this.snapshots.restore(snapshot, root);
        }
        await updateRestoredWorkspace(root, threadId, access, this.#config.git);
        await this.#pinImage(threadId, snapshot.image);
        return;
      } catch (error) {
        console.warn(`Could not restore the environment of ${access.cloneUrl}:`, error);
        await clearDirectory(root);
      }
    }
    await cloneRepository(root, threadId, access, this.#config.git);
    await this.#setUp(threadId, root, key, baseImageId);
  }

  async #setUp(threadId: string, root: string, key: string, baseImageId: string) {
    const state = await scriptState(root, SETUP_SCRIPT);
    if (state === "missing") return;
    if (state === "not-executable") {
      console.warn(`${SETUP_SCRIPT} is not executable (chmod +x); it was not run`);
      return;
    }
    try {
      await this.#build(threadId, root, key, baseImageId);
    } catch (error) {
      console.warn(`The setup of ${key} failed; see ${this.snapshots.logPath(key)}:`, error);
    }
  }

  async #build(threadId: string, root: string, key: string, baseImageId: string) {
    const image = this.snapshots.imageFor(key);
    const previous = await this.#imageId(image);
    await setupEnvironment({
      docker: this.#config.docker,
      key,
      baseImage: this.#config.image,
      image,
      root,
      logPath: this.snapshots.logPath(key),
      runner: this.#config.runner,
      memoryMb: this.#config.memoryMb,
      cpus: this.#config.cpus,
      pidsLimit: this.#config.pidsLimit,
      platform: this.#config.platform,
      runtime: this.#config.runtime,
      hostUser: hostUser(),
    });
    await this.snapshots.publish(key, { image, baseImageId, workspace: root });
    await rm(this.#spareDir(key), { recursive: true, force: true });
    await this.#pinImage(threadId, image);
    if (previous && previous !== (await this.#imageId(image))) {
      await this.#config.docker(["rmi", previous]);
    }
    return { image };
  }

  async #imageId(image: string) {
    const inspected = await this.#config.docker(["image", "inspect", "--format", "{{.Id}}", image]);
    return inspected.code === 0 ? inspected.stdout.trim() : "";
  }

  #imageFile(threadId: string) {
    return join(this.#config.home, "environments", `${threadId}.image`);
  }

  async #pinImage(threadId: string, image: string) {
    await mkdir(join(this.#config.home, "environments"), { recursive: true });
    await writeFile(this.#imageFile(threadId), image);
  }

  #spareDir(key: string) {
    return join(this.#config.home, "spares", key);
  }

  async #claimSpare(key: string, snapshotCreatedAt: string, root: string) {
    const dir = this.#spareDir(key);
    try {
      const meta = JSON.parse(await readFile(join(dir, "meta.json"), "utf8")) as {
        snapshotCreatedAt?: string;
      };
      if (meta.snapshotCreatedAt !== snapshotCreatedAt) {
        await rm(dir, { recursive: true, force: true });
        return false;
      }
    } catch {
      return false;
    }
    try {
      await rm(root, { recursive: true, force: true });
      await rename(join(dir, "workspace"), root);
      await rm(dir, { recursive: true, force: true });
      return true;
    } catch (error) {
      console.warn(`Could not use the spare workspace of ${key}:`, error);
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
      await rm(root, { recursive: true, force: true }).catch(() => undefined);
      await mkdir(root, { recursive: true });
      return false;
    }
  }

  #warmLater(environment: { key: string; baseImageId: string }, access: RepoAccess) {
    const delay = this.#config.spareDelayMs ?? DEFAULT_SPARE_DELAY_MS;
    const warming: Promise<unknown> = new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, delay);
      timer.unref?.();
    })
      .then(() => this.#inTurn(environment.key, () => this.#prepareSpare(environment, access)))
      .catch((error: unknown) => {
        console.warn(`Could not prepare a spare workspace of ${environment.key}:`, error);
      })
      .finally(() => this.#warming.delete(warming));
    this.#warming.add(warming);
  }

  async #prepareSpare(
    { key, baseImageId }: { key: string; baseImageId: string },
    access: RepoAccess,
  ) {
    const snapshot = await this.snapshots.valid(key, baseImageId);
    if (!snapshot) return;
    const dir = this.#spareDir(key);
    const kept = await readFile(join(dir, "meta.json"), "utf8")
      .then((text) => (JSON.parse(text) as { snapshotCreatedAt?: string }).snapshotCreatedAt)
      .catch(() => undefined);
    if (kept === snapshot.createdAt) return;
    const spares = join(this.#config.home, "spares");
    await mkdir(spares, { recursive: true });
    const building = `${dir}.building`;
    await rm(building, { recursive: true, force: true });
    try {
      await this.snapshots.restore(snapshot, join(building, "workspace"));
      await fetchBranch(
        join(building, "workspace"),
        access,
        access.defaultBranch,
        this.#config.git,
      ).catch(() => undefined);
      await writeFile(
        join(building, "meta.json"),
        JSON.stringify({ snapshotCreatedAt: snapshot.createdAt }),
      );
      await rm(dir, { recursive: true, force: true });
      await rename(building, dir);
    } catch (error) {
      await rm(building, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
    await this.#evictSpares(spares, key);
  }

  async #evictSpares(spares: string, keep: string) {
    const names = (await readdir(spares)).filter((name) => !name.endsWith(".building"));
    if (names.length <= SPARES_KEPT) return;
    const aged = await Promise.all(
      names.map(async (name) => ({ name, at: (await stat(join(spares, name))).mtimeMs })),
    );
    aged.sort((a, b) => a.at - b.at);
    for (const { name } of aged.slice(0, names.length - SPARES_KEPT)) {
      if (name !== keep) await rm(join(spares, name), { recursive: true, force: true });
    }
  }
}
