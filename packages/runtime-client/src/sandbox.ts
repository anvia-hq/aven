import { randomBytes } from "node:crypto";
import { mkdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createDesktopTools } from "@anvia/sandbox";
import { RemoteSandboxHub } from "@anvia/sandbox/remote";
import type { AnyTool } from "@anvia/core";

import type { SandboxDesktop } from "@anvia/sandbox";
import type { RepoAccess } from "@aven/protocol/runtime-wire";

import { cloneRepository, git, isCloned, type Git } from "./git-clone";
import { hasRunningProcesses, sandboxTools } from "./thread-tools";

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
  docker?: (args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>;
};

export type ThreadSandbox = {
  /** What the agent can do in the thread's container: files, commands, processes and a desktop. */
  tools: readonly AnyTool[];
  /** Whether a process the agent started there, such as a dev server, is still running. */
  hasRunningProcesses(): Promise<boolean>;
};

type Docker = NonNullable<SandboxConfig["docker"]>;

const WORKDIR = "/workspace";
const PLATFORM_PATTERN = /^linux\/(amd64|arm64)(\/v\d+)?$/;
const RUNTIME_PATTERN = /^[a-z0-9][a-z0-9_.-]*$/i;
const DEFAULT_CONNECT_TIMEOUT_MS = 90_000;
const CONNECT_POLL_MS = 50;

async function docker(args: string[]) {
  const proc = Bun.spawn(["docker", ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stdout, stderr };
}

type DockerRunInput = {
  name: string;
  threadId: string;
  image: string;
  /** The thread's workspace on this machine. */
  root: string;
  /** How the container reaches this machine. */
  host: string;
  hubPort: number;
  token: string;
  memoryMb: number;
  cpus: number;
  pidsLimit: number;
  /** Passed to `docker run --platform`; the host's own when not set. */
  platform?: string;
  /** Passed to `docker run --runtime`; the daemon's default when not set. */
  runtime?: string;
  /** `uid:gid` to run as, so files written to the bind mount belong to the host user. */
  user?: string;
};

// The `docker run` arguments for one thread's container.
export function dockerRunArgs(input: DockerRunInput) {
  const args = [
    "run",
    "-d",
    "--name",
    input.name,
    "--label",
    "aven.sandbox=1",
    "--label",
    `aven.thread=${input.threadId}`,
    "--add-host",
    `${input.host}:host-gateway`,
    "--memory",
    `${input.memoryMb}m`,
    "--cpus",
    String(input.cpus),
    "--pids-limit",
    String(input.pidsLimit),
    "--shm-size",
    "512m",
    "--security-opt",
    "no-new-privileges",
    "-v",
    `${input.root}:${WORKDIR}`,
    "-e",
    `ANVIA_CONTROL_URL=ws://${input.host}:${input.hubPort}/daemon`,
    "-e",
    `ANVIA_SANDBOX_TOKEN=${input.token}`,
    "-e",
    `ANVIA_SANDBOX_WORKDIR=${WORKDIR}`,
  ];
  if (input.platform) args.push("--platform", input.platform);
  if (input.runtime) args.push("--runtime", input.runtime);
  if (input.user) args.push("--user", input.user);
  args.push(input.image);
  return args;
}

function safeJson(text: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** What a runner needs to run a thread: the sandbox its agent works in. */
export interface ThreadWorkspaces {
  /**
   * `repo` asks the control plane how to clone the thread's repository; it is called only when the
   * workspace holds no clone yet (decision 0013).
   */
  acquire(thread: { id: string }, repo: () => Promise<RepoAccess>): Promise<ThreadSandbox>;
  /** The desktop of the thread's sandbox while its container is running; never starts one. */
  desktop(threadId: string): SandboxDesktop | undefined;
  /** Frees what a thread holds (its container); its workspace files stay for the next `acquire`. */
  release(threadId: string): Promise<void>;
  dispose(): Promise<void>;
}

// Gives an agent a Docker container to work in instead of the host (decisions 0009, 0010, 0012).
// Each thread gets its own container from a desktop image, with an empty workspace directory the
// runner manages mounted at /workspace; every tool the agent has acts inside the container, so it
// sees that directory and nothing else of the runner's.
// A daemon in the container dials out to a hub in this process, authenticated by a one-container
// token; the control plane is not involved.
export class Sandboxes implements ThreadWorkspaces {
  #config: SandboxConfig;
  #hub: RemoteSandboxHub;
  #port: number;
  #tokens: Map<string, string>;
  #run: Docker;
  #running = new Set<string>();
  // A thread's workspace, while it is being cloned or once it is ready, so two runs never clone twice.
  #roots = new Map<string, Promise<string>>();
  #starting = new Map<string, Promise<void>>();

  private constructor(
    config: SandboxConfig,
    hub: RemoteSandboxHub,
    port: number,
    tokens: Map<string, string>,
  ) {
    this.#config = config;
    this.#hub = hub;
    this.#port = port;
    this.#tokens = tokens;
    this.#run = config.docker ?? docker;
  }

  // Fails now, with what to do about it, rather than on the first run.
  static async start(config: SandboxConfig) {
    const run = config.docker ?? docker;
    const check = await run(["image", "inspect", config.image]).catch(() => ({
      code: 1,
      stdout: "",
      stderr: "docker is not installed or not running",
    }));
    if (check.code !== 0) {
      throw new Error(
        `The sandbox image ${config.image} is not available (${check.stderr.trim() || "unknown error"}). ` +
          `Docker must be running; build the image with: docker build -t ${config.image} apps/runtime/sandbox-image`,
      );
    }
    const gitCheck = await (config.git ?? git)(["--version"], { cwd: "." }).catch(() => ({
      code: 1,
      stdout: "",
      stderr: "git is not installed",
    }));
    if (gitCheck.code !== 0) {
      throw new Error("git is required to clone each thread's repository but was not found");
    }
    if (config.platform !== undefined && !PLATFORM_PATTERN.test(config.platform)) {
      throw new Error(
        `The sandbox platform "${config.platform}" is not one Docker knows; use linux/amd64 or linux/arm64`,
      );
    }
    if (config.runtime !== undefined) {
      if (!RUNTIME_PATTERN.test(config.runtime)) {
        throw new Error(`The sandbox runtime "${config.runtime}" is not a Docker runtime name`);
      }
      const info = await run(["info", "--format", "{{json .Runtimes}}"]);
      const registered: Record<string, unknown> = info.code === 0 ? safeJson(info.stdout) : {};
      if (!(config.runtime in registered)) {
        throw new Error(
          `The Docker daemon has no runtime "${config.runtime}" (AVEN_SANDBOX_RUNTIME); for gVisor, install runsc and register it with \`runsc install\`, then restart Docker`,
        );
      }
    }
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
    const sandboxes = new Sandboxes(config, hub, port, tokens);
    // Containers left by a crashed runtime would hold project directories open.
    await sandboxes.#removeStale();
    return sandboxes;
  }

  async acquire(thread: { id: string }, repo: () => Promise<RepoAccess>): Promise<ThreadSandbox> {
    const root = await this.#workspace(thread.id, repo);
    await this.#ensure(thread.id, root);
    const runtime = this.#hub.runtime(thread.id, { workdir: WORKDIR });
    return {
      tools: [
        ...sandboxTools(runtime),
        ...createDesktopTools({ sandbox: this.#hub.desktop(thread.id) }),
      ],
      // A container that is gone has nothing running, and asking it would wait for a daemon.
      hasRunningProcesses: async () =>
        this.#hub.isConnected(thread.id) && (await hasRunningProcesses(runtime)),
    };
  }

  desktop(threadId: string) {
    return this.#hub.isConnected(threadId) ? this.#hub.desktop(threadId) : undefined;
  }

  async release(threadId: string) {
    // A container that is still starting would otherwise come up after we removed it.
    await this.#starting.get(threadId)?.catch(() => undefined);
    this.#roots.delete(threadId);
    await this.#teardown(threadId);
  }

  async #teardown(threadId: string) {
    this.#running.delete(threadId);
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

  // The thread's workspace: the repository cloned on first use and kept for its later runs. Real
  // path, so the file tools' confinement and the bind mount agree on what the directory is.
  #workspace(threadId: string, repo: () => Promise<RepoAccess>) {
    const known = this.#roots.get(threadId);
    if (known) return known;
    const preparing = this.#prepare(threadId, repo);
    this.#roots.set(threadId, preparing);
    // A failed clone is tried again by the next run.
    preparing.catch(() => this.#roots.delete(threadId));
    return preparing;
  }

  async #prepare(threadId: string, repo: () => Promise<RepoAccess>) {
    const home = this.#config.home ?? join(homedir(), ".aven", "runtime");
    const dir = join(home, "workspaces", threadId);
    await mkdir(dir, { recursive: true });
    const root = await realpath(dir);
    if (await isCloned(root)) return root;
    await cloneRepository(root, threadId, await repo(), this.#config.git ?? git);
    return root;
  }

  #name(threadId: string) {
    return `aven-sandbox-${threadId}`;
  }

  async #removeStale() {
    const { stdout } = await this.#run(["ps", "-aq", "--filter", "label=aven.sandbox"]);
    const ids = stdout.split("\n").filter(Boolean);
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
    const { memoryMb = 2048, cpus = 2, pidsLimit = 512 } = this.#config;
    const args = dockerRunArgs({
      name,
      threadId,
      image: this.#config.image,
      root,
      host: this.#config.hostName ?? "host.docker.internal",
      hubPort: this.#port,
      token,
      memoryMb,
      cpus,
      pidsLimit,
      platform: this.#config.platform,
      runtime: this.#config.runtime,
      user: hostUser(),
    });
    const started = await this.#run(args);
    if (started.code !== 0) {
      this.#tokens.delete(token);
      throw new Error(`Could not start the sandbox: ${started.stderr.trim() || started.stdout}`);
    }
    this.#running.add(threadId);
    await this.#awaitDaemon(threadId);
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

// On Linux a bind mount keeps host ownership, so files must be written as the host user.
function hostUser() {
  if (process.platform !== "linux" || !process.getuid || !process.getgid) return undefined;
  return `${process.getuid()}:${process.getgid()}`;
}
