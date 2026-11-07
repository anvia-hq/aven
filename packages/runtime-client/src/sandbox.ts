import { createHash, randomBytes } from "node:crypto";
import { access, mkdir, realpath, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createDesktopTools } from "@anvia/sandbox";
import { RemoteSandboxHub } from "@anvia/sandbox/remote";
import type { AnyTool } from "@anvia/core";
import { UPLOADS_DIR } from "@aven/agents/attachments";
import { WORKSPACE_DIR } from "@aven/agents/sandbox-tools";
import { SKILLS_DIR } from "@aven/agents/skills";

import type { SandboxDesktop } from "@anvia/sandbox";
import type {
  RepoAccess,
  RunEnvVar,
  RunGithub,
  RunIdentityCredential,
} from "@aven/protocol/runtime-wire";

import { ArtifactStore } from "./artifacts";
import { homeRepairArgs } from "./container-home";
import {
  RESUME_SCRIPT,
  containerBaseArgs,
  hostUser,
  scriptState,
  type ContainerBase,
  type DockerRun,
} from "./environment-setup";
import { Environments, type ThreadRef } from "./environments";
import { git, isCloned, type Git } from "./git-clone";
import { signInCommand } from "./github-signin";
import { identitySignInCommand } from "./identity-signin";
import { envOf, withProjectEnv } from "./project-env";
import { ensureLocalExcludes } from "./local-excludes";
import { runCommand } from "./run-command";
import { preflight, type HostCommands } from "./sandbox-preflight";
import { secretRedactor } from "./secret-redaction";
import { SkillStore } from "./skills";
import type { SnapshotStore } from "./snapshots";
import { startedOnUse } from "./started-on-use";
import { terminalShell } from "./terminal-shell";
import { threadProcesses, type ThreadProcesses } from "./thread-processes";
import { hasRunningProcesses, sandboxTools } from "./thread-tools";
import { UploadStore } from "./uploads";

export const runtimeHome = (home?: string) => home ?? join(homedir(), ".aven", "runtime");
export const journalPathIn = (home?: string) => join(runtimeHome(home), "runs.db");

export const runnerLabel = (home?: string) =>
  createHash("sha256")
    .update(resolve(runtimeHome(home)))
    .digest("hex")
    .slice(0, 16);

export type SandboxConfig = {
  image: string;
  platform?: string;
  runtime?: string;
  home?: string;
  memoryMb?: number;
  cpus?: number;
  pidsLimit?: number;
  hostName?: string;
  connectTimeoutMs?: number;
  git?: Git;
  docker?: DockerRun;
};

export type AcquireOptions = {
  lazy?: boolean;
};

export type ThreadSandbox = {
  tools: readonly AnyTool[];
  hasRunningProcesses(): Promise<boolean>;
  processes: ThreadProcesses;
  start?(): Promise<void>;
};

type Docker = DockerRun;

const DEFAULT_CONNECT_TIMEOUT_MS = 90_000;
const CONNECT_POLL_MS = 50;
const RESUME_TIMEOUT_MS = 10_000;
const SIGN_IN_TIMEOUT_MS = 30_000;

const docker: Docker = (args, options) => runCommand(["docker", ...args], options);

type DockerRunInput = Omit<ContainerBase, "label"> & {
  threadId: string;
  image: string;
  root: string;
  uploads: string;
  skills: string;
  host: string;
  hubPort: number;
  token: string;
  user?: string;
};

export function dockerRunArgs(input: DockerRunInput) {
  const args = containerBaseArgs(
    { ...input, label: `aven.thread=${input.threadId}` },
    {
      beforeLimits: ["--add-host", `${input.host}:host-gateway`],
      afterLimits: [
        "--security-opt",
        "no-new-privileges",
        "-v",
        `${input.root}:${WORKSPACE_DIR}`,
        "-v",
        `${input.uploads}:${UPLOADS_DIR}:ro`,
        "-v",
        `${input.skills}:${SKILLS_DIR}:ro`,
        "-e",
        `ANVIA_CONTROL_URL=ws://${input.host}:${input.hubPort}/daemon`,
        "-e",
        `ANVIA_SANDBOX_TOKEN=${input.token}`,
        "-e",
        `ANVIA_SANDBOX_WORKDIR=${WORKSPACE_DIR}`,
      ],
    },
  );
  if (input.user) args.push("--user", input.user);
  args.push(input.image);
  return args;
}

export interface ThreadWorkspaces {
  acquire(
    thread: ThreadRef,
    repo?: () => Promise<RepoAccess>,
    options?: AcquireOptions,
  ): Promise<ThreadSandbox>;
  desktop(threadId: string): SandboxDesktop | undefined;
  shell?(
    threadId: string,
    sessionId: string,
  ): { argv: string[]; env: Record<string, string>; hangup: string[] } | undefined;
  workspace(threadId: string): Promise<string | undefined>;
  release(threadId: string): Promise<void>;
  running?(): number;
  signInGithub?(threadId: string, github: RunGithub | undefined): Promise<void>;
  signInIdentity?(
    threadId: string,
    identity: RunIdentityCredential | undefined,
    controlPlane: string,
  ): Promise<void>;
  setProjectEnv?(threadId: string, env: readonly RunEnvVar[] | undefined): void;
  saveEnvironment?(thread: ThreadRef, access: RepoAccess): Promise<{ image: string }>;
  readonly artifacts?: ArtifactStore;
  readonly uploads?: UploadStore;
  readonly skills?: SkillStore;
  dispose(): Promise<void>;
}

export class Sandboxes implements ThreadWorkspaces {
  readonly artifacts: ArtifactStore;
  readonly uploads: UploadStore;
  readonly skills: SkillStore;
  readonly snapshots: SnapshotStore;
  #config: SandboxConfig;
  #containers: { runner: string; memoryMb: number; cpus: number; pidsLimit: number };
  #host: string;
  #environments: Environments;
  #hub: RemoteSandboxHub;
  #port: number;
  #tokens: Map<string, string>;
  #run: Docker;
  #running = new Set<string>();
  #roots = new Map<string, Promise<string>>();
  #starting = new Map<string, Promise<void>>();
  #projectEnv = new Map<string, Readonly<Record<string, string>>>();
  #redactors = new Map<string, ReturnType<typeof secretRedactor>>();

  private constructor(
    config: SandboxConfig,
    commands: HostCommands,
    hub: RemoteSandboxHub,
    port: number,
    tokens: Map<string, string>,
  ) {
    this.#config = config;
    this.#containers = {
      runner: runnerLabel(config.home),
      memoryMb: config.memoryMb ?? 8192,
      cpus: config.cpus ?? 4,
      pidsLimit: config.pidsLimit ?? 1024,
    };
    this.#host = config.hostName ?? "host.docker.internal";
    this.artifacts = new ArtifactStore(join(runtimeHome(config.home), "artifacts"));
    this.uploads = new UploadStore(join(runtimeHome(config.home), "uploads"));
    this.skills = new SkillStore(join(runtimeHome(config.home), "skills"));
    this.#environments = new Environments({
      image: config.image,
      platform: config.platform,
      runtime: config.runtime,
      ...this.#containers,
      home: runtimeHome(config.home),
      docker: commands.docker,
      git: commands.git,
    });
    this.snapshots = this.#environments.snapshots;
    this.#hub = hub;
    this.#port = port;
    this.#tokens = tokens;
    this.#run = commands.docker;
  }

  static async start(config: SandboxConfig) {
    const commands = { docker: config.docker ?? docker, git: config.git ?? git };
    await preflight(config, commands);
    const tokens = new Map<string, string>();
    const hub = new RemoteSandboxHub({
      authorize: (token) => {
        const sandboxId = tokens.get(token);
        return sandboxId ? { sandboxId } : null;
      },
      connectTimeoutMs: config.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
    });
    const { port } = await hub.listen({ host: "0.0.0.0", port: 0, path: "/daemon" });
    const sandboxes = new Sandboxes(config, commands, hub, port, tokens);
    await sandboxes.#removeStale();
    return sandboxes;
  }

  async acquire(
    thread: ThreadRef,
    repo?: () => Promise<RepoAccess>,
    { lazy = false }: AcquireOptions = {},
  ): Promise<ThreadSandbox> {
    let preparing: Promise<void> | undefined;
    const prepare = async () => {
      const root = await this.#workspace(thread, repo);
      await this.#ensure(thread.id, root);
    };
    const startLazily = () => {
      preparing ??= prepare().catch((error: unknown) => {
        preparing = undefined;
        throw error;
      });
      return preparing;
    };
    const eager = !(lazy && repo);
    const root = eager ? await this.#workspace(thread, repo) : undefined;
    const start = eager
      ? () =>
          this.#ensure(thread.id, root!).then(() => (repo ? undefined : this.#noteUsed(thread.id)))
      : startLazily;
    const upWhenNeeded = <T extends object>(sandbox: T) =>
      repo && eager ? sandbox : startedOnUse(sandbox, start);
    if (repo && eager) await start();
    if (!repo && (await this.#usedBefore(thread.id))) void start().catch(() => undefined);
    const runtime = withProjectEnv(
      upWhenNeeded(this.#hub.runtime(thread.id, { workdir: WORKSPACE_DIR })),
      () => this.#projectEnv.get(thread.id),
    );
    return {
      tools: [
        ...sandboxTools(runtime, { id: thread.id, artifacts: this.artifacts }),
        ...createDesktopTools({ sandbox: upWhenNeeded(this.#hub.desktop(thread.id)) }),
      ],
      hasRunningProcesses: async () =>
        this.#hub.isConnected(thread.id) && (await hasRunningProcesses(runtime)),
      processes: threadProcesses(
        runtime,
        () => this.#hub.isConnected(thread.id),
        () => this.#redactors.get(thread.id),
      ),
      start,
    };
  }

  desktop(threadId: string) {
    return this.#hub.isConnected(threadId) ? this.#hub.desktop(threadId) : undefined;
  }

  shell(threadId: string, sessionId: string) {
    if (!/^[\w-]+$/.test(sessionId)) throw new Error("Invalid terminal id");
    if (!this.#running.has(threadId) || !this.#hub.isConnected(threadId)) return undefined;
    const project = this.#projectEnv.get(threadId) ?? {};
    return terminalShell({ container: this.#name(threadId), sessionId, project });
  }

  async workspace(threadId: string) {
    const dir = this.#workspaceDir(threadId);
    return (await isCloned(dir)) ? realpath(dir) : undefined;
  }

  running() {
    return this.#running.size;
  }

  async release(threadId: string) {
    await this.#starting.get(threadId)?.catch(() => undefined);
    this.#roots.delete(threadId);
    await this.#teardown(threadId);
  }

  async #teardown(threadId: string) {
    this.#running.delete(threadId);
    this.#projectEnv.delete(threadId);
    this.#redactors.delete(threadId);
    this.#dropTokens(threadId);
    this.#hub.forget(threadId);
    await this.#run(["rm", "-f", this.#name(threadId)]);
  }

  async dispose() {
    const threads = new Set([...this.#running, ...this.#starting.keys()]);
    const released = [...threads].map((id) =>
      this.release(id).catch((error: unknown) => {
        console.error(`Could not remove the sandbox of thread ${id}:`, error);
      }),
    );
    await Promise.all(released);
    await this.#hub.close();
  }

  #workspace(thread: ThreadRef, repo?: () => Promise<RepoAccess>) {
    const known = this.#roots.get(thread.id);
    if (known) return known;
    const preparing = this.#prepare(thread, repo);
    this.#roots.set(thread.id, preparing);
    preparing.catch(() => this.#roots.delete(thread.id));
    return preparing;
  }

  async #prepare(thread: ThreadRef, repo?: () => Promise<RepoAccess>) {
    if (!repo) return this.#emptyWorkspace(thread.id);
    const root = await this.#fillWorkspace(thread, repo);
    await ensureLocalExcludes(root).catch((error: unknown) => {
      console.warn(`Could not keep package stores out of git in ${root}:`, error);
    });
    return root;
  }

  async #emptyWorkspace(threadId: string) {
    const dir = this.#workspaceDir(threadId);
    await mkdir(dir, { recursive: true });
    return realpath(dir);
  }

  async #fillWorkspace(thread: ThreadRef, repo: () => Promise<RepoAccess>) {
    const dir = this.#workspaceDir(thread.id);
    await mkdir(dir, { recursive: true });
    const root = await realpath(dir);
    if (await isCloned(root)) return root;
    if (thread.forkOf) {
      const parent = this.#workspaceDir(thread.forkOf);
      if (await isCloned(parent)) {
        await this.#environments.fork(thread, await realpath(parent), thread.forkOf, root);
        return root;
      }
    }
    await this.#environments.fill(thread, root, await repo());
    return root;
  }

  #usedFile(id: string) {
    return join(runtimeHome(this.#config.home), "bot-computers", id);
  }

  async #usedBefore(id: string) {
    return access(this.#usedFile(id)).then(
      () => true,
      () => false,
    );
  }

  async #noteUsed(id: string) {
    await mkdir(join(runtimeHome(this.#config.home), "bot-computers"), { recursive: true });
    await writeFile(this.#usedFile(id), "").catch(() => undefined);
  }

  setProjectEnv(threadId: string, env: readonly RunEnvVar[] | undefined) {
    if (env?.length) this.#projectEnv.set(threadId, envOf(env));
    else this.#projectEnv.delete(threadId);
    const redact = secretRedactor(env);
    if (redact) this.#redactors.set(threadId, redact);
    else this.#redactors.delete(threadId);
  }

  signInGithub(threadId: string, github: RunGithub | undefined) {
    return this.#signIn(threadId, "GitHub", signInCommand(github));
  }

  signInIdentity(
    threadId: string,
    identity: RunIdentityCredential | undefined,
    controlPlane: string,
  ) {
    return this.#signIn(
      threadId,
      "identity",
      identitySignInCommand(identity, controlPlane, this.#host),
    );
  }

  async #signIn(
    threadId: string,
    what: string,
    { script, env }: { script: string; env: Record<string, string> },
  ) {
    const result = await this.#hub
      .runtime(threadId, { workdir: WORKSPACE_DIR })
      .exec({ command: "sh", args: ["-c", script], env, timeoutMs: SIGN_IN_TIMEOUT_MS });
    if (result.status !== "exited" || result.exitCode !== 0) {
      throw new Error(
        `Could not sign in to ${what}: ${new TextDecoder().decode(result.stderr).trim()}`,
      );
    }
  }

  async saveEnvironment(thread: ThreadRef, access: RepoAccess) {
    const root = await this.workspace(thread.id);
    if (!root) throw new Error("The thread has no workspace yet");
    return this.#environments.save(thread, root, access);
  }

  #workspaceDir(threadId: string) {
    return join(runtimeHome(this.#config.home), "workspaces", threadId);
  }

  #name(threadId: string) {
    return `aven-sandbox-${threadId}`;
  }

  async #removeStale() {
    const { stdout } = await this.#run([
      "ps",
      "-a",
      "--filter",
      "label=aven.sandbox",
      "--format",
      '{{.ID}} {{.Label "aven.runner"}}',
    ]);
    const ids = stdout
      .split("\n")
      .map((line) => line.trim().split(" "))
      .filter(([id, runner]) => id && (!runner || runner === this.#containers.runner))
      .map(([id]) => id as string);
    if (ids.length > 0) await this.#run(["rm", "-f", ...ids]);
  }

  #ensure(threadId: string, root: string) {
    if (this.#running.has(threadId) && this.#hub.isConnected(threadId)) return Promise.resolve();
    let starting = this.#starting.get(threadId);
    if (!starting) {
      starting = this.#startContainer(threadId, root).finally(() =>
        this.#starting.delete(threadId),
      );
      this.#starting.set(threadId, starting);
    }
    return starting;
  }

  async #startContainer(threadId: string, root: string) {
    const name = this.#name(threadId);
    await this.#run(["rm", "-f", name]);
    const token = randomBytes(24).toString("base64url");
    this.#dropTokens(threadId);
    this.#tokens.set(token, threadId);
    const user = hostUser();
    const args = dockerRunArgs({
      name,
      threadId,
      image: await this.#environments.imageOf(threadId),
      root,
      uploads: await this.uploads.dir(threadId),
      skills: await this.skills.dir(threadId),
      host: this.#host,
      hubPort: this.#port,
      token,
      ...this.#containers,
      platform: this.#config.platform,
      runtime: this.#config.runtime,
      user,
    });
    const started = await this.#run(args);
    if (started.code !== 0) {
      this.#tokens.delete(token);
      throw new Error(`Could not start the sandbox: ${started.stderr.trim() || started.stdout}`);
    }
    this.#running.add(threadId);
    if (user) await this.#repairHome(name, user);
    await this.#awaitDaemon(threadId);
    await this.#resume(name, root);
  }

  async #repairHome(name: string, user: string) {
    const repaired = await this.#run(homeRepairArgs(name, user));
    if (repaired.code !== 0) {
      console.warn(
        `Could not repair the home of ${name} (exit ${repaired.code}):`,
        repaired.stderr.trim(),
      );
    }
  }

  async #resume(name: string, root: string) {
    if ((await scriptState(root, RESUME_SCRIPT)) !== "ready") return;
    const ran = await this.#run(["exec", "-w", WORKSPACE_DIR, name, `./${RESUME_SCRIPT}`], {
      timeoutMs: RESUME_TIMEOUT_MS,
    });
    if (ran.code !== 0) {
      console.warn(`${RESUME_SCRIPT} did not finish well (exit ${ran.code}):`, ran.stderr.trim());
    }
  }

  async #awaitDaemon(threadId: string) {
    const timeoutMs = this.#config.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;
    while (!this.#hub.isConnected(threadId)) {
      if (Date.now() >= deadline) {
        await this.#teardown(threadId);
        throw new Error(`The sandbox did not connect within ${Math.round(timeoutMs / 1000)}s`);
      }
      await Bun.sleep(CONNECT_POLL_MS);
    }
  }

  #dropTokens(threadId: string) {
    for (const [token, id] of this.#tokens) if (id === threadId) this.#tokens.delete(token);
  }
}
