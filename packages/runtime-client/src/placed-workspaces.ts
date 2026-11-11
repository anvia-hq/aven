import type { RepoAccess, RunEnvVar, RunGithub, RunIdentityCredential } from "@aven/protocol/types";

import { fetchBranch } from "./fetch-branch";
import { takeFork } from "./take-fork";
import { markTurn } from "./thread-diff";
import type { AcquireOptions, ThreadRef, ThreadWorkspaces } from "./types";

export class PlacedWorkspaces implements ThreadWorkspaces {
  constructor(
    private host: ThreadWorkspaces,
    private machines: ThreadWorkspaces,
    private onMachine: (threadId: string) => boolean,
  ) {}

  #of(threadId: string) {
    return this.onMachine(threadId) ? this.machines : this.host;
  }

  get uploads() {
    const { host } = this;
    if (!host.uploads) return undefined;
    return {
      save: (threadId: string, name: string, bytes: Uint8Array) =>
        (this.#of(threadId).uploads ?? host.uploads!).save(threadId, name, bytes),
    };
  }

  get artifacts() {
    const { host } = this;
    if (!host.artifacts) return undefined;
    const of = (threadId: string) => this.#of(threadId).artifacts ?? host.artifacts!;
    return {
      save: (threadId: string, bytes: Uint8Array, mediaType: string) =>
        of(threadId).save(threadId, bytes, mediaType),
      keep: (threadId: string, name: string, bytes: Uint8Array) =>
        of(threadId).keep(threadId, name, bytes),
      read: (threadId: string, name: string) => of(threadId).read(threadId, name),
    };
  }

  get skills() {
    const { host } = this;
    if (!host.skills) return undefined;
    return {
      install: (...args: Parameters<NonNullable<ThreadWorkspaces["skills"]>["install"]>) =>
        (this.#of(args[0]).skills ?? host.skills!).install(...args),
    };
  }

  acquire(thread: ThreadRef, repo?: () => Promise<RepoAccess>, options?: AcquireOptions) {
    return this.#of(thread.id).acquire(thread, repo, options);
  }

  shell(threadId: string, sessionId: string) {
    return this.host.shell?.(threadId, sessionId);
  }

  workspace(threadId: string) {
    return this.#of(threadId).workspace(threadId);
  }

  paths(threadId: string) {
    return this.#of(threadId).paths?.(threadId);
  }

  async markTurn(threadId: string) {
    const workspaces = this.#of(threadId);
    if (workspaces.markTurn) return workspaces.markTurn(threadId);
    const root = await workspaces.workspace(threadId);
    return root ? markTurn(root).catch(() => false) : false;
  }

  async fetchBranch(threadId: string, access: RepoAccess, branch?: string) {
    const workspaces = this.#of(threadId);
    if (workspaces.fetchBranch) return workspaces.fetchBranch(threadId, access, branch);
    const root = await workspaces.workspace(threadId);
    if (!root) throw new Error("The thread has no workspace yet");
    return fetchBranch(root, access, branch);
  }

  async takeFork(threadId: string, forkId: string) {
    const workspaces = this.#of(threadId);
    if (workspaces.takeFork) return workspaces.takeFork(threadId, forkId);
    return takeFork(workspaces, threadId, forkId);
  }

  release(threadId: string) {
    return this.#of(threadId).release(threadId);
  }

  async putAway(threadId: string) {
    await this.#of(threadId).putAway?.(threadId);
  }

  running() {
    return this.host.running?.() ?? 0;
  }

  async signInGithub(threadId: string, github: RunGithub | undefined) {
    await this.#of(threadId).signInGithub?.(threadId, github);
  }

  async signInIdentity(
    threadId: string,
    identity: RunIdentityCredential | undefined,
    controlPlane: string,
  ) {
    await this.#of(threadId).signInIdentity?.(threadId, identity, controlPlane);
  }

  setProjectEnv(threadId: string, env: readonly RunEnvVar[] | undefined) {
    this.#of(threadId).setProjectEnv?.(threadId, env);
  }

  async dispose() {
    await Promise.all([this.host.dispose(), this.machines.dispose()]);
  }
}
