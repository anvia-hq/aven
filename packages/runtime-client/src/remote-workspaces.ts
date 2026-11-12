import type { SandboxPaths, SkillListing } from "@aven/agents/types";
import type { ArtifactContent, RepoAccess, RunEnvVar, RunSkill } from "@aven/protocol/types";
import type { TakenChanges } from "@aven/agents/tools/types";

import { extname } from "node:path";
import { asRecord, errorMessage } from "@aven/agents/values";
import { ARTIFACT_EXTENSIONS } from "@aven/protocol/runtime-wire";
import { envOf, withProjectEnv } from "./project-env";
import { RemoteSandbox } from "./remote-sandbox";
import { startedOnUse } from "./started-on-use";
import { threadProcesses } from "./thread-processes";
import { safeFileName } from "./uploads";
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
  #images = new Map<string, Map<string, ArtifactContent>>();
  #waiting = new Map<string, Waiting[]>();
  #delivering = new Map<string, Promise<void>>();
  #placed = new Map<string, Map<string, string>>();
  #pending = new Map<string, string[]>();

  constructor(private callFor: (threadId: string) => MachineCall) {}

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
    placed: (threadId: string, name: string) => this.#placed.get(threadId)?.get(name),
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
    read: async (threadId: string, name: string) => this.#images.get(threadId)?.get(name) ?? null,
  };

  #image(threadId: string, name: string, content: ArtifactContent) {
    const images = this.#images.get(threadId) ?? new Map<string, ArtifactContent>();
    images.set(name, content);
    this.#images.set(threadId, images);
  }

  #wait(threadId: string, waiting: Waiting) {
    const list = this.#waiting.get(threadId) ?? [];
    list.push(waiting);
    this.#waiting.set(threadId, list);
  }

  #deliver(threadId: string, call: MachineCall) {
    const earlier = this.#delivering.get(threadId) ?? Promise.resolve();
    const delivery = earlier.catch(() => undefined).then(() => this.#drain(threadId, call));
    this.#delivering.set(threadId, delivery);
    return delivery.finally(() => {
      if (this.#delivering.get(threadId) === delivery) this.#delivering.delete(threadId);
    });
  }

  async #settle(threadId: string) {
    if (!this.#waiting.get(threadId)?.length) return;

    await this.#deliver(threadId, this.callFor(threadId)).catch(() => undefined);
  }

  async #drain(threadId: string, call: MachineCall) {
    const waiting = this.#waiting.get(threadId);
    while (waiting?.length) {
      const next = waiting[0]!;
      const result = await call(next.op, next.args);

      if (next.op === "uploads.save") this.#placedUpload(threadId, result);

      waiting.shift();
    }
    this.#waiting.delete(threadId);
  }

  #placedUpload(threadId: string, result: unknown) {
    const path = asRecord(result).path;

    if (typeof path !== "string" || path.length === 0) return;

    const name = path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);

    if (!name) return;

    const placed = this.#placed.get(threadId) ?? new Map<string, string>();
    placed.set(name, path);
    this.#placed.set(threadId, placed);
    const pending = this.#pending.get(threadId) ?? [];
    pending.push(path);
    this.#pending.set(threadId, pending);
  }

  #claim(threadId: string, name: string) {
    const path = this.#placed.get(threadId)?.get(name);

    if (!path) return;

    const pending = this.#pending.get(threadId);

    if (!pending) return;

    const left = pending.filter((item) => item !== path);

    if (left.length === 0) this.#pending.delete(threadId);
    else this.#pending.set(threadId, left);
  }

  #placedNote(threadId: string) {
    const pending = this.#pending.get(threadId);

    if (!pending?.length) return;

    this.#pending.delete(threadId);

    if (pending.length === 1) return `An attached file is now on the computer at ${pending[0]}.`;

    return `Attached files are now on the computer:\n${pending.map((path) => `- ${path}`).join("\n")}`;
  }

  #flush(threadId: string, call: MachineCall) {
    if (!this.#waiting.has(threadId) || this.#delivering.has(threadId)) return;

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

        if (prepared.paths) this.#paths.set(thread.id, prepared.paths);

        await this.#deliver(thread.id, raw);
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

  async takeFork(threadId: string, forkId: string) {
    return (await this.callFor(threadId)("fork.take", { forkId })) as TakenChanges;
  }

  setProjectEnv(threadId: string, env: readonly RunEnvVar[] | undefined) {
    if (env?.length) this.#env.set(threadId, envOf(env));
    else this.#env.delete(threadId);

    void this.callFor(threadId)("setProjectEnv", { env }).catch(() => undefined);
  }

  async release(threadId: string) {
    this.#env.delete(threadId);
    this.#images.delete(threadId);
    this.#placed.delete(threadId);
    this.#pending.delete(threadId);
  }

  async dispose() {
    this.#paths.clear();
    this.#env.clear();
    this.#images.clear();
    this.#waiting.clear();
    this.#placed.clear();
    this.#pending.clear();
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
