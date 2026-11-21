import type { SandboxPaths, SkillListing } from "@aven/agents/types";
import type { ArtifactContent, RepoAccess, RunEnvVar, RunSkill } from "@aven/protocol/types";
import type { TakenChanges } from "@aven/agents/tools/types";

import { extname } from "node:path";
import { asRecord, errorMessage } from "@aven/agents/values";
import { ARTIFACT_EXTENSIONS } from "@aven/protocol/runtime-wire";
import { envOf, withProjectEnv } from "../security/project-env";
import { RemoteSandbox } from "./remote-sandbox";
import { startedOnUse } from "./started-on-use";
import { threadProcesses } from "../thread-processes";
import { safeFileName } from "../files/uploads";
import { hasRunningProcesses, sandboxTools } from "../tools/thread-tools";

import type {
  AcquireOptions,
  Fetched,
  FetchSkill,
  MachineCall,
  ThreadRef,
  ThreadSandbox,
  ThreadWorkspaces,
} from "../types";

type RemoteThreadState = {
  paths?: SandboxPaths;
  env?: Readonly<Record<string, string>>;
  images?: Map<string, ArtifactContent>;
  waiting?: Waiting[];
  delivering?: Promise<void>;
  placed?: Map<string, string>;
  pending?: string[];
};

export class RemoteWorkspaces implements ThreadWorkspaces {
  #threads = new Map<string, RemoteThreadState>();

  constructor(private callFor: (threadId: string) => MachineCall) {}

  #thread(threadId: string): RemoteThreadState {
    let state = this.#threads.get(threadId);

    if (!state) {
      state = {};
      this.#threads.set(threadId, state);
    }

    return state;
  }

  call(threadId: string) {
    return this.callFor(threadId);
  }

  readonly uploads = {
    save: async (threadId: string, name: string, bytes: Uint8Array) => {
      const data = bytes.toBase64();
      try {
        const saved = await this.callFor(threadId)("uploads.save", { name, data });
        return (saved as { path: string }).path;
      } catch (error) {
        const waiting = waitingName(name);
        this.#wait(threadId, { op: "uploads.save", args: { name: waiting, data, exact: true } });
        console.warn(
          `Keeping ${waiting} for ${threadId} until its computer is reached:`,
          errorMessage(error),
        );
        return waiting;
      }
    },
    settle: (threadId: string) => this.#settle(threadId),
    placed: (threadId: string, name: string) => this.#threads.get(threadId)?.placed?.get(name),
    claim: (threadId: string, name: string) => this.#claim(threadId, name),
    placedNote: (threadId: string) => this.#placedNote(threadId),
  };

  readonly artifacts = {
    save: async (threadId: string, bytes: Uint8Array, mediaType: string) => {
      const saved = await this.callFor(threadId)("artifacts.save", {
        data: bytes.toBase64(),
        mediaType,
      });
      const { name } = saved as { name: string };
      this.#image(threadId, name, { mediaType, data: bytes.toBase64() });
      return name;
    },
    keep: async (threadId: string, name: string, bytes: Uint8Array) => {
      const mediaType = ARTIFACT_MEDIA_TYPES[name.slice(name.lastIndexOf(".") + 1)];
      const data = bytes.toBase64();

      if (mediaType) this.#image(threadId, name, { mediaType, data });

      await this.callFor(threadId)("artifacts.keep", { name, data }).catch(() =>
        this.#wait(threadId, { op: "artifacts.keep", args: { name, data } }),
      );
    },
    read: async (threadId: string, name: string) =>
      this.#threads.get(threadId)?.images?.get(name) ?? null,
  };

  #image(threadId: string, name: string, content: ArtifactContent) {
    const state = this.#thread(threadId);
    state.images ??= new Map<string, ArtifactContent>();
    state.images.set(name, content);
  }

  #wait(threadId: string, waiting: Waiting) {
    const state = this.#thread(threadId);
    state.waiting ??= [];
    state.waiting.push(waiting);
  }

  #deliver(threadId: string, call: MachineCall) {
    const state = this.#thread(threadId);
    const earlier = state.delivering ?? Promise.resolve();
    const delivery = earlier.catch(() => undefined).then(() => this.#drain(threadId, call));
    state.delivering = delivery;
    return delivery.finally(() => {
      if (state.delivering === delivery) state.delivering = undefined;
    });
  }

  async #settle(threadId: string) {
    if (!this.#threads.get(threadId)?.waiting?.length) return;

    await this.#deliver(threadId, this.callFor(threadId)).catch(() => undefined);
  }

  async #drain(threadId: string, call: MachineCall) {
    const state = this.#threads.get(threadId);
    const waiting = state?.waiting;
    while (waiting?.length) {
      const next = waiting[0]!;
      const result = await call(next.op, next.args);

      if (next.op === "uploads.save") this.#placedUpload(threadId, result);

      waiting.shift();
    }

    if (state) state.waiting = undefined;
  }

  #placedUpload(threadId: string, result: unknown) {
    const path = asRecord(result).path;

    if (typeof path !== "string" || path.length === 0) return;

    const name = path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);

    if (!name) return;

    const state = this.#thread(threadId);
    state.placed ??= new Map<string, string>();
    state.placed.set(name, path);
    state.pending ??= [];
    state.pending.push(path);
  }

  #claim(threadId: string, name: string) {
    const state = this.#threads.get(threadId);
    const path = state?.placed?.get(name);

    if (!path || !state?.pending) return;

    const left = state.pending.filter((item) => item !== path);
    state.pending = left.length === 0 ? undefined : left;
  }

  #placedNote(threadId: string) {
    const state = this.#threads.get(threadId);
    const pending = state?.pending;

    if (!state || !pending?.length) return;

    state.pending = undefined;

    if (pending.length === 1) return `An attached file is now on the computer at ${pending[0]}.`;

    return `Attached files are now on the computer:\n${pending.map((path) => `- ${path}`).join("\n")}`;
  }

  #flush(threadId: string, call: MachineCall) {
    const state = this.#threads.get(threadId);

    if (!state?.waiting?.length || state.delivering) return;

    this.#deliver(threadId, call).catch((error: unknown) => {
      console.warn(`Files kept for ${threadId} are still waiting:`, errorMessage(error));
    });
  }

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
    const raw = this.callFor(thread.id);
    const call: MachineCall = async (op, args) => {
      const result = await raw(op, args);
      this.#flush(thread.id, raw);
      return result;
    };
    let preparing: Promise<void> | undefined;
    const start = () =>
      (preparing ??= (async () => {
        const { id: _id, machine: _machine, ...rest } = thread;
        const directory = folder ? await folder() : null;
        const access = !directory && repo ? await repo() : undefined;
        const prepared = (await call("prepare", {
          thread: rest,
          repo: access,
          folder: directory,
        })) as { paths: SandboxPaths | null };

        if (prepared.paths) this.#thread(thread.id).paths = prepared.paths;

        await this.#deliver(thread.id, raw);
      })().catch((error: unknown) => {
        preparing = undefined;
        throw error;
      }));

    if (!this.#threads.get(thread.id)?.paths) {
      const paths = (await call("paths").catch(() => null)) as SandboxPaths | null;

      if (paths) this.#thread(thread.id).paths = paths;
    }

    const remote = new RemoteSandbox(
      thread.id,
      call,
      () => this.#threads.get(thread.id)?.paths?.workspace,
    );
    const runtime = withProjectEnv(
      startedOnUse(remote, start),
      () => this.#threads.get(thread.id)?.env,
    );
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
    return this.#threads.get(threadId)?.paths;
  }

  async markTurn(threadId: string) {
    return (await this.callFor(threadId)("turn.mark")) as boolean;
  }

  async fetchBranch(threadId: string, access: RepoAccess, branch?: string) {
    return (await this.callFor(threadId)("git.fetch", { repo: access, branch })) as Fetched;
  }

  async takeFork(threadId: string, forkId: string) {
    return (await this.callFor(threadId)("fork.take", { forkId })) as TakenChanges;
  }

  setProjectEnv(threadId: string, env: readonly RunEnvVar[] | undefined) {
    const state = this.#thread(threadId);
    state.env = env?.length ? envOf(env) : undefined;
    void this.callFor(threadId)("setProjectEnv", { env }).catch(() => undefined);
  }

  async release(threadId: string) {
    this.#threads.delete(threadId);
  }

  async dispose() {
    this.#threads.clear();
  }
}

function waitingName(name: string) {
  const safe = safeFileName(name);
  const extension = extname(safe);
  return `${safe.slice(0, safe.length - extension.length)}-${crypto.randomUUID().slice(0, 4)}${extension}`;
}

const ARTIFACT_MEDIA_TYPES: Record<string, string> = Object.fromEntries(
  Object.entries(ARTIFACT_EXTENSIONS).map(([mediaType, extension]) => [extension, mediaType]),
);

type Waiting = { op: "uploads.save" | "artifacts.keep"; args: Record<string, unknown> };

type InstallAnswer = { listings: SkillListing[] } | { missing: string[] };
