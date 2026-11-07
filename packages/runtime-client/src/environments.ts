import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { RepoAccess } from "@aven/protocol/runtime-wire";

import {
  SETUP_SCRIPT,
  hostUser,
  scriptState,
  setupEnvironment,
  type DockerRun,
} from "./environment-setup";
import { fetchBranch } from "./fetch-branch";
import { forkWorkspace } from "./fork-workspace";
import { clearDirectory, cloneRepository, type Git } from "./git-clone";
import { updateRestoredWorkspace } from "./restore-workspace";
import { SnapshotStore } from "./snapshots";

/** The thread a workspace or an environment is for. */
export type ThreadRef = { id: string; organizationId?: string; forkOf?: string };

export type EnvironmentsConfig = {
  /** The sandbox image setups start from and threads without a snapshot run. */
  image: string;
  platform?: string;
  runtime?: string;
  runner: string;
  memoryMb: number;
  cpus: number;
  pidsLimit: number;
  /** The runner's home: snapshots go in `snapshots/`, the image each thread keeps in `environments/`. */
  home: string;
  docker: DockerRun;
  git: Git;
  /** How long after a thread gets its workspace the next one's is prepared; default 5 seconds. */
  spareDelayMs?: number;
};

// How many repositories keep a spare workspace at once, the least recently prepared going first.
const SPARES_KEPT = 3;
const DEFAULT_SPARE_DELAY_MS = 5_000;

// The environments repositories set up for themselves (decision 0043): a thread's workspace filled
// from a snapshot, or cloned and set up, one setup at a time per repository, and the image each
// thread's container is made from.
export class Environments {
  /** What repositories' setups made on this runner. */
  readonly snapshots: SnapshotStore;
  #config: EnvironmentsConfig;
  // The setup or restore of a repository's environment, one at a time, so a second thread on the
  // repository finds the snapshot the first made instead of running the setup again.
  #turns = new Map<string, Promise<unknown>>();
  // Spares being prepared, so a test (or a stop) can wait for them.
  #warming = new Set<Promise<unknown>>();

  constructor(config: EnvironmentsConfig) {
    this.#config = config;
    this.snapshots = new SnapshotStore(join(config.home, "snapshots"));
  }

  // Puts the repository in `root`, which holds no clone: from its snapshot where snapshots apply,
  // else a plain clone.
  async fill(thread: ThreadRef, root: string, access: RepoAccess) {
    const environment = await this.#environmentOf(thread, access);
    if (!environment) {
      await cloneRepository(root, thread.id, access, this.#config.git);
      return;
    }
    await this.#inTurn(environment.key, () => this.#fill(thread.id, root, access, environment));
    this.#warmLater(environment, access);
  }

  // A thread forked from another (decision 0135): the parent's workspace copied into `root`, and the
  // image the parent keeps, so the fork's container has the dependencies the parent's has.
  async fork(thread: ThreadRef, parentRoot: string, parentId: string, root: string) {
    await forkWorkspace(parentRoot, root, thread.id, this.#config.git);
    const pinned = (await readFile(this.#imageFile(parentId), "utf8").catch(() => "")).trim();
    if (pinned) await this.#pinImage(thread.id, pinned);
  }

  /** Resolves when no spare workspace is being prepared. */
  async settled() {
    while (this.#warming.size > 0) await Promise.allSettled(this.#warming);
  }

  // Runs the repository's `.aven/setup` again in `root` and keeps what it makes as the snapshot.
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

  // The image the thread's container is made from: the one it keeps, else the sandbox image.
  async imageOf(threadId: string) {
    const pinned = await readFile(this.#imageFile(threadId), "utf8").catch(() => "");
    return pinned.trim() || this.#config.image;
  }

  // The repository's snapshot key and the image it must be made from; null where snapshots do not
  // apply: a thread with no organization, or a Docker that cannot name the sandbox image.
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

  // One at a time per key; a failure of one does not stop the next.
  #inTurn<T>(key: string, work: () => Promise<T>) {
    const turn = (this.#turns.get(key) ?? Promise.resolve()).catch(() => undefined).then(work);
    this.#turns.set(key, turn);
    return turn.finally(() => {
      if (this.#turns.get(key) === turn) this.#turns.delete(key);
    });
  }

  // Puts the repository in `root`: restored from the snapshot when there is a valid one, else
  // cloned and, when the repository has a setup script, set up and snapshotted.
  async #fill(
    threadId: string,
    root: string,
    access: RepoAccess,
    { key, baseImageId }: { key: string; baseImageId: string },
  ) {
    const snapshot = await this.snapshots.valid(key, baseImageId);
    if (snapshot) {
      try {
        // A workspace prepared beforehand takes no copying: it is moved into place (decision 0128).
        if (!(await this.#claimSpare(key, snapshot.createdAt, root))) {
          await this.snapshots.restore(snapshot, root);
        }
        await updateRestoredWorkspace(root, threadId, access, this.#config.git);
        await this.#pinImage(threadId, snapshot.image);
        return;
      } catch (error) {
        // A snapshot that cannot be restored is not worth failing the thread for: clone afresh.
        console.warn(`Could not restore the environment of ${access.cloneUrl}:`, error);
        await clearDirectory(root);
      }
    }
    await cloneRepository(root, threadId, access, this.#config.git);
    await this.#setUp(threadId, root, key, baseImageId);
  }

  // Runs the repository's `.aven/setup`, if it has one, and keeps what it made. A setup that fails
  // does not fail the thread: it works on the bare image, and the next thread tries again.
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

  // The setup itself: runs the script, keeps the snapshot and points the thread at its image.
  async #build(threadId: string, root: string, key: string, baseImageId: string) {
    const image = this.snapshots.imageFor(key);
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
    // A spare was made from the snapshot this one replaces.
    await rm(this.#spareDir(key), { recursive: true, force: true });
    await this.#pinImage(threadId, image);
    return { image };
  }

  // A thread keeps the image it started from, so its container does not change under it when the
  // snapshot is replaced or goes out of date.
  #imageFile(threadId: string) {
    return join(this.#config.home, "environments", `${threadId}.image`);
  }

  async #pinImage(threadId: string, image: string) {
    await mkdir(join(this.#config.home, "environments"), { recursive: true });
    await writeFile(this.#imageFile(threadId), image);
  }

  // The workspaces kept ready for the next thread of a repository (decision 0128): the snapshot's,
  // already restored and fetched, in `<home>/spares/<key>/` with the snapshot it was made from. A
  // thread that needs one takes it by moving it, so starting costs no copy of `node_modules`; the
  // next is prepared in the background once that thread has got its own.
  #spareDir(key: string) {
    return join(this.#config.home, "spares", key);
  }

  async #claimSpare(key: string, snapshotCreatedAt: string, root: string) {
    const dir = this.#spareDir(key);
    try {
      const meta = JSON.parse(await readFile(join(dir, "meta.json"), "utf8")) as {
        snapshotCreatedAt?: string;
      };
      // One made from another snapshot is not what the repository's threads start from now.
      if (meta.snapshotCreatedAt !== snapshotCreatedAt) {
        await rm(dir, { recursive: true, force: true });
        return false;
      }
    } catch {
      return false;
    }
    try {
      // `root` is an empty directory made for the thread; the spare takes its place.
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

  // Prepares the repository's next workspace a moment after this one was made, so it does not
  // compete with the thread that is starting. A failure is only logged: no spare is a slower start.
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
      // The default branch as it is now, so the thread that takes it has little left to fetch. A
      // failure is not one of the spare: the thread fetches it itself.
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

  // Keeps the spares of the few repositories used last: each is as large as a workspace.
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
