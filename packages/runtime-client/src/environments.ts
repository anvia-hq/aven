import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { RepoAccess } from "@aven/protocol/runtime-wire";

import {
  SETUP_SCRIPT,
  hostUser,
  scriptState,
  setupEnvironment,
  type DockerRun,
} from "./environment-setup";
import { clearDirectory, cloneRepository, type Git } from "./git-clone";
import { updateRestoredWorkspace } from "./restore-workspace";
import { SnapshotStore } from "./snapshots";

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
};

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

  constructor(config: EnvironmentsConfig) {
    this.#config = config;
    this.snapshots = new SnapshotStore(join(config.home, "snapshots"));
  }

  // Puts the repository in `root`, which holds no clone: from its snapshot where snapshots apply,
  // else a plain clone.
  async fill(thread: { id: string; organizationId?: string }, root: string, access: RepoAccess) {
    const environment = await this.#environmentOf(thread, access);
    if (!environment) {
      await cloneRepository(root, thread.id, access, this.#config.git);
      return;
    }
    await this.#inTurn(environment.key, () => this.#fill(thread.id, root, access, environment));
  }

  // Runs the repository's `.aven/setup` again in `root` and keeps what it makes as the snapshot.
  async save(thread: { id: string; organizationId?: string }, root: string, access: RepoAccess) {
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
        await this.snapshots.restore(snapshot, root);
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
}
