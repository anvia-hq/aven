import type { SandboxPaths } from "@aven/agents/types";
import type { RepoAccess, RunEnvVar, RunSkill } from "@aven/protocol/types";
import type { SkillListing } from "@aven/agents/types";

import { envOf, withProjectEnv } from "./project-env";
import { RemoteSandbox } from "./remote-sandbox";
import { startedOnUse } from "./started-on-use";
import { threadProcesses } from "./thread-processes";
import { hasRunningProcesses, sandboxTools } from "./thread-tools";

import type {
  AcquireOptions,
  Fetched,
  FetchSkill,
  MachineCall,
  ThreadRef,
  ThreadSandbox,
  ThreadWorkspaces,
} from "./types";

export class RemoteWorkspaces implements ThreadWorkspaces {
  #paths = new Map<string, SandboxPaths>();
  #env = new Map<string, Readonly<Record<string, string>>>();

  constructor(private callFor: (threadId: string) => MachineCall) {}

  readonly uploads = {
    save: async (threadId: string, name: string, bytes: Uint8Array) => {
      const saved = await this.callFor(threadId)("uploads.save", { name, data: bytes.toBase64() });
      return (saved as { path: string }).path;
    },
  };

  readonly artifacts = {
    save: async (threadId: string, bytes: Uint8Array, mediaType: string) => {
      const saved = await this.callFor(threadId)("artifacts.save", {
        data: bytes.toBase64(),
        mediaType,
      });
      return (saved as { name: string }).name;
    },
    keep: async (threadId: string, name: string, bytes: Uint8Array) => {
      await this.callFor(threadId)("artifacts.keep", { name, data: bytes.toBase64() });
    },
    read: async () => null,
  };

  readonly skills = {
    install: async (threadId: string, skills: readonly RunSkill[], fetch: FetchSkill) => {
      const call = this.callFor(threadId);
      const first = (await call("skills.install", { skills })) as InstallAnswer;
      if (!("missing" in first)) return first.listings;
      const archives: Record<string, string> = {};
      for (const digest of first.missing) archives[digest] = (await fetch(digest)).toBase64();
      const second = (await call("skills.install", { skills, archives })) as InstallAnswer;
      return "listings" in second ? second.listings : [];
    },
  };

  async acquire(
    thread: ThreadRef,
    repo?: () => Promise<RepoAccess>,
    { folder }: AcquireOptions = {},
  ): Promise<ThreadSandbox> {
    const call = this.callFor(thread.id);
    let preparing: Promise<void> | undefined;
    const start = () =>
      (preparing ??= (async () => {
        const { id: _id, machine: _machine, ...rest } = thread;
        const prepared = (await call("prepare", {
          thread: rest,
          repo: repo ? await repo() : undefined,
          folder: folder ? await folder() : null,
        })) as { paths: SandboxPaths | null };
        if (prepared.paths) this.#paths.set(thread.id, prepared.paths);
      })().catch((error: unknown) => {
        preparing = undefined;
        throw error;
      }));
    if (!this.#paths.has(thread.id)) {
      const paths = (await call("paths").catch(() => null)) as SandboxPaths | null;
      if (paths) this.#paths.set(thread.id, paths);
    }
    const remote = new RemoteSandbox(thread.id, call, () => this.#paths.get(thread.id)?.workspace);
    const runtime = withProjectEnv(startedOnUse(remote, start), () => this.#env.get(thread.id));
    return {
      tools: sandboxTools(runtime, { id: thread.id, artifacts: this.artifacts }),
      runtime,
      hasRunningProcesses: () => hasRunningProcesses(runtime),
      processes: threadProcesses(runtime, () => true),
      start,
      state: () => "awake",
    };
  }

  async workspace(threadId: string) {
    const found = (await this.callFor(threadId)("workspace").catch(() => null)) as {
      path: string | null;
    } | null;
    return found?.path ?? undefined;
  }

  paths(threadId: string) {
    return this.#paths.get(threadId);
  }

  async markTurn(threadId: string) {
    return (await this.callFor(threadId)("turn.mark")) as boolean;
  }

  async fetchBranch(threadId: string, access: RepoAccess, branch?: string) {
    return (await this.callFor(threadId)("git.fetch", { repo: access, branch })) as Fetched;
  }

  setProjectEnv(threadId: string, env: readonly RunEnvVar[] | undefined) {
    if (env?.length) this.#env.set(threadId, envOf(env));
    else this.#env.delete(threadId);
    void this.callFor(threadId)("setProjectEnv", { env }).catch(() => undefined);
  }

  async release(threadId: string) {
    this.#paths.delete(threadId);
    this.#env.delete(threadId);
  }

  async dispose() {
    this.#paths.clear();
    this.#env.clear();
  }
}

type InstallAnswer = { listings: SkillListing[] } | { missing: string[] };
