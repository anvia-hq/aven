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

// Where a runner keeps its workspaces and its journal of runs.
export const runtimeHome = (home?: string) => home ?? join(homedir(), ".aven", "runtime");
export const journalPathIn = (home?: string) => join(runtimeHome(home), "runs.db");

/**
 * Names the runner a container belongs to by its home, so two runners on one machine, such as the
 * control plane's own and a standalone one with another home, leave each other's containers alone.
 */
export const runnerLabel = (home?: string) =>
  createHash("sha256")
    .update(resolve(runtimeHome(home)))
    .digest("hex")
    .slice(0, 16);

export type SandboxConfig = {
  /** A desktop sandbox image (see apps/runtime/sandbox-image). */
  image: string;
  /**
   * The platform containers are started for, e.g. `linux/amd64` to run the image with Google
   * Chrome on an arm64 host under emulation (decision 0014). Default: the host's own.
   */
  platform?: string;
  /**
   * The Docker runtime containers run under, as registered in the daemon, e.g. `runsc` for gVisor so
   * a container does not share the host kernel (decision 0016). Default: the daemon's own.
   */
  runtime?: string;
  /** Where the runner keeps thread workspaces, in `workspaces/<thread id>`. Default `~/.aven/runtime`. */
  home?: string;
  memoryMb?: number;
  cpus?: number;
  pidsLimit?: number;
  /** Where the container finds this machine; the default works on Docker Desktop and Linux. */
  hostName?: string;
  /** How long to wait for a started container's daemon to dial in. Default 90 seconds. */
  connectTimeoutMs?: number;
  /** Replaced in tests. */
  git?: Git;
  /** Replaced in tests. */
  docker?: DockerRun;
};

export type AcquireOptions = {
  /**
   * Hand the sandbox back at once, with its workspace and container being got ready in the
   * background: its tools wait for them, and `start` resolves when they are there (decision 0128).
   * For a run, which can have its model answering while they are. Only with a repository.
   */
  lazy?: boolean;
};

export type ThreadSandbox = {
  /** What the agent can do in the thread's container: files, commands, processes and a desktop. */
  tools: readonly AnyTool[];
  /** Whether a process the agent started there, such as a dev server, is still running. */
  hasRunningProcesses(): Promise<boolean>;
  /** The processes in the container, for a person to see and stop (decision 0071); never starts it. */
  processes: ThreadProcesses;
  /**
   * Starts the container now if it is not running, and resolves once it is up. A thread's is
   * started by `acquire`; one acquired without a repository is started by its first tool, or by
   * this (decision 0059).
   */
  start?(): Promise<void>;
};

type Docker = DockerRun;

const DEFAULT_CONNECT_TIMEOUT_MS = 90_000;
const CONNECT_POLL_MS = 50;
// `.aven/resume` is for a quick login or repair: the agent waits this long for it, then goes on.
const RESUME_TIMEOUT_MS = 10_000;
const SIGN_IN_TIMEOUT_MS = 30_000;

const docker: Docker = (args, options) => runCommand(["docker", ...args], options);

type DockerRunInput = Omit<ContainerBase, "label"> & {
  threadId: string;
  image: string;
  /** The thread's workspace on this machine. */
  root: string;
  /** The files the thread's users attached, on this machine; mounted read-only (decision 0034). */
  uploads: string;
  /** The skills of the thread's runs, on this machine; mounted read-only (decision 0035). */
  skills: string;
  /** How the container reaches this machine. */
  host: string;
  hubPort: number;
  token: string;
  /** `uid:gid` to run as, so files written to the bind mount belong to the host user. */
  user?: string;
};

// The `docker run` arguments for one thread's container.
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

/** What a runner needs to run a thread: the sandbox its agent works in. */
export interface ThreadWorkspaces {
  /**
   * `repo` asks the control plane how to clone the thread's repository; it is called only when the
   * workspace holds no clone yet (decision 0013). Without it the workspace is an empty directory
   * that is kept between acquires, and the container is started by the first tool that needs it:
   * a bot's computer has no repository and mostly stays off (decision 0059).
   */
  acquire(
    thread: ThreadRef,
    repo?: () => Promise<RepoAccess>,
    options?: AcquireOptions,
  ): Promise<ThreadSandbox>;
  /** The desktop of the thread's sandbox while its container is running; never starts one. */
  desktop(threadId: string): SandboxDesktop | undefined;
  /**
   * The command that opens a shell in the thread's running container, on a terminal the caller
   * provides, or undefined when it is not running; never starts one (decision 0053). `env` is for
   * the command's own process: the project's variables are named in `argv` and valued only there.
   * `hangup` is the command that ends that shell and what it started, which Docker does not do when
   * the client of an `exec` goes away; it is safe to run more than once. `sessionId` names the shell
   * for it. Without `shell`, a thread has no terminal.
   */
  shell?(
    threadId: string,
    sessionId: string,
  ): { argv: string[]; env: Record<string, string>; hangup: string[] } | undefined;
  /** The thread's workspace directory on this machine once it holds a clone; never clones one. */
  workspace(threadId: string): Promise<string | undefined>;
  /** Frees what a thread holds (its container); its workspace files stay for the next `acquire`. */
  release(threadId: string): Promise<void>;
  /** How many containers are running now, for the machine's load shown in Settings (decision 0091). */
  running?(): number;
  /**
   * Signs `gh` and `git` in to GitHub as `github` inside the thread's container, or out when there
   * is none, for a run that is starting (decision 0044). The thread's container must be running.
   * Without it, a run's agent has no GitHub account.
   */
  signInGithub?(threadId: string, github: RunGithub | undefined): Promise<void>;
  /**
   * Lets `aven id-token` in the thread's container mint identity tokens with `identity` from the
   * control plane at `controlPlane`, or takes that away when there is none, for a run that is
   * starting (decision 0049). Without it, a run's agent has no identity to mint tokens with.
   */
  signInIdentity?(
    threadId: string,
    identity: RunIdentityCredential | undefined,
    controlPlane: string,
  ): Promise<void>;
  /**
   * Gives the commands and processes the agent starts in the thread's container `env`, the
   * project's variables of the run that is starting, or none (decision 0045). Kept in memory, in
   * place of the last run's. Without it, a run's commands have no project variables.
   */
  setProjectEnv?(threadId: string, env: readonly RunEnvVar[] | undefined): void;
  /**
   * Runs the repository's `.aven/setup` again in a setup container and keeps what it makes as the
   * snapshot new threads start from (decision 0043). Throws, with the end of the script's output,
   * when there is no script or it fails. Without it, an agent cannot save an environment.
   */
  saveEnvironment?(thread: ThreadRef, access: RepoAccess): Promise<{ image: string }>;
  /** The images agents showed (decision 0033); without it, none can be read back. */
  readonly artifacts?: ArtifactStore;
  /** The files users attach (decision 0034); without it, a message with files cannot run. */
  readonly uploads?: UploadStore;
  /** The skills of runs (decision 0035); without it, runs have none. */
  readonly skills?: SkillStore;
  dispose(): Promise<void>;
}

// Gives an agent a Docker container to work in instead of the host (decisions 0009, 0010, 0012).
// Each thread gets its own container from a desktop image, with an empty workspace directory the
// runner manages mounted at /workspace; every tool the agent has acts inside the container, so it
// sees that directory and nothing else of the runner's.
// A daemon in the container dials out to a hub in this process, authenticated by a one-container
// token; the control plane is not involved.
export class Sandboxes implements ThreadWorkspaces {
  readonly artifacts: ArtifactStore;
  readonly uploads: UploadStore;
  readonly skills: SkillStore;
  /** What repositories' setups made on this runner (decision 0043). */
  readonly snapshots: SnapshotStore;
  #config: SandboxConfig;
  // The container limits and how a container reaches this machine, with their defaults.
  #containers: { runner: string; memoryMb: number; cpus: number; pidsLimit: number };
  #host: string;
  #environments: Environments;
  #hub: RemoteSandboxHub;
  #port: number;
  #tokens: Map<string, string>;
  #run: Docker;
  #running = new Set<string>();
  // A thread's workspace, while it is being cloned or once it is ready, so two runs never clone twice.
  #roots = new Map<string, Promise<string>>();
  #starting = new Map<string, Promise<void>>();
  // The project's variables the thread's current run was given, in memory only (decision 0045).
  #projectEnv = new Map<string, Readonly<Record<string, string>>>();
  // What hides the secrets among them from what a person is shown of the thread's processes.
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

  // Fails now, with what to do about it, rather than on the first run.
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
    // The container reaches this port through the host gateway, so it cannot be loopback-only.
    const { port } = await hub.listen({ host: "0.0.0.0", port: 0, path: "/daemon" });
    const sandboxes = new Sandboxes(config, commands, hub, port, tokens);
    // Containers left by a crashed runtime would hold project directories open.
    await sandboxes.#removeStale();
    return sandboxes;
  }

  async acquire(
    thread: ThreadRef,
    repo?: () => Promise<RepoAccess>,
    { lazy = false }: AcquireOptions = {},
  ): Promise<ThreadSandbox> {
    // A lazy sandbox is made ready by its first `start`, and by whatever needs it before: both wait
    // for the same preparation, and one that failed is tried again by the next.
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
    // A thread's container is up before its run begins (a lazy one's first tool waits for it); a
    // bot's when something first needs it.
    const upWhenNeeded = <T extends object>(sandbox: T) =>
      repo && eager ? sandbox : startedOnUse(sandbox, start);
    if (repo && eager) await start();
    // A bot that has used its computer before is likely to again: it is started now, in the
    // background, so the first tool of the reply finds it up (decision 0130). One that never has, or
    // that only talks, starts nothing.
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
      // A container that is gone has nothing running, and asking it would wait for a daemon.
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
    // A container that is still starting would otherwise come up after we removed it.
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
    // One container that will not go must not keep the hub open.
    const released = [...threads].map((id) =>
      this.release(id).catch((error: unknown) => {
        console.error(`Could not remove the sandbox of thread ${id}:`, error);
      }),
    );
    await Promise.all(released);
    await this.#hub.close();
  }

  // The thread's workspace: the repository cloned on first use (or restored from its snapshot) and
  // kept for its later runs. Real path, so the file tools' confinement and the bind mount agree on
  // what the directory is.
  #workspace(thread: ThreadRef, repo?: () => Promise<RepoAccess>) {
    const known = this.#roots.get(thread.id);
    if (known) return known;
    const preparing = this.#prepare(thread, repo);
    this.#roots.set(thread.id, preparing);
    // A failed clone is tried again by the next run.
    preparing.catch(() => this.#roots.delete(thread.id));
    return preparing;
  }

  async #prepare(thread: ThreadRef, repo?: () => Promise<RepoAccess>) {
    if (!repo) return this.#emptyWorkspace(thread.id);
    const root = await this.#fillWorkspace(thread, repo);
    // A package manager's store left in the workspace is never a change; for a workspace that
    // exists already as much as for a new one.
    await ensureLocalExcludes(root).catch((error: unknown) => {
      console.warn(`Could not keep package stores out of git in ${root}:`, error);
    });
    return root;
  }

  // A directory with nothing in it, made once and kept: there is no repository to clone.
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
    // A fork starts as a copy of its parent's workspace when this runner still has it; otherwise it
    // is a thread like any other and clones the repository (decision 0135).
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

  // Which bots have used their computers: a file for each in the runner's home, so it holds across
  // restarts and costs nothing for a bot that never has.
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

  // This runner's containers, and those of a runner from before containers named theirs, which
  // have no `aven.runner` label.
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

  // Starts the thread's container once, even when several runs ask at the same time, and
  // resolves only when its daemon is connected: a run that finds the container running but not
  // yet connected must wait for it, never restart it.
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
      // Made before the container starts, so a file attached while it runs shows up in it.
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

  // A thread keeps the image it started from, which an environment saved before decision 0095 made
  // with a home the host user cannot use: repaired in the container, which costs nothing on an image
  // that has the fix. A failure is logged and the agent goes on.
  async #repairHome(name: string, user: string) {
    const repaired = await this.#run(homeRepairArgs(name, user));
    if (repaired.code !== 0) {
      console.warn(
        `Could not repair the home of ${name} (exit ${repaired.code}):`,
        repaired.stderr.trim(),
      );
    }
  }

  // Runs the repository's `.aven/resume`, if it has one, now that the container is up. The run
  // waits for it a few seconds at most; a failure is logged and the agent goes on.
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
