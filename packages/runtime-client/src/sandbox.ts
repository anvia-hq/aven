import { randomBytes } from "node:crypto";
import { mkdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createDesktopTools, type SandboxExecStreamEvent } from "@anvia/sandbox";
import { RemoteSandboxHub } from "@anvia/sandbox/remote";
import type { AnyTool } from "@anvia/core";
import type { Launcher, RunningProcess } from "@aven/agents/jobs/job-registry";

export type SandboxConfig = {
  /** A desktop sandbox image (see apps/runtime/sandbox-image). */
  image: string;
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
  docker?: (args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>;
};

export type ThreadSandbox = {
  /** The thread's workspace on this machine, mounted at /workspace in its container. */
  root: string;
  /** Runs a command inside the thread's container; hand it to a `JobRegistry`. */
  launcher: Launcher;
  /** What else the agent gets there: a desktop it can see and drive. */
  tools: readonly AnyTool[];
};

type Docker = NonNullable<SandboxConfig["docker"]>;

const WORKDIR = "/workspace";
const DEFAULT_CONNECT_TIMEOUT_MS = 90_000;
const CONNECT_POLL_MS = 50;
// What a command reports when the sandbox went away under it, or its own limit ended it.
const SANDBOX_LOST_EXIT_CODE = 255;
const SANDBOX_TIMEOUT_EXIT_CODE = 124;
// Long enough that a job's own timeout, not the daemon's default, decides when a command ends.
const DAEMON_COMMAND_TIMEOUT_MS = 24 * 60 * 60 * 1000;

async function docker(args: string[]) {
  const proc = Bun.spawn(["docker", ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stdout, stderr };
}

// Where a host path lands in the sandbox: its working directory is the project directory
// (mounted at /workspace), and the exec API takes paths relative to it.
export function containerPath(root: string, path: string) {
  if (path === root) return ".";
  if (path.startsWith(`${root}/`)) return path.slice(root.length + 1);
  throw new Error(`${path} is outside the workspace ${root}, which is all the sandbox can reach`);
}

// A stream the sandbox's output is pushed into; pushing after the reader is gone is harmless.
function byteChannel() {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const stream = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) });
  return {
    stream,
    push(data: Uint8Array) {
      try {
        controller?.enqueue(data);
      } catch {
        // The reader cancelled.
      }
    },
    close() {
      try {
        controller?.close();
      } catch {
        // Already closed.
      }
    },
  };
}

// Adapts a sandbox exec stream to the process shape a JobRegistry expects.
function toProcess(events: AsyncIterable<SandboxExecStreamEvent>, abort: AbortController) {
  const out = byteChannel();
  const err = byteChannel();
  const exited = (async () => {
    let code = SANDBOX_LOST_EXIT_CODE;
    try {
      for await (const event of events) {
        if (event.type === "stdout") out.push(event.data);
        else if (event.type === "stderr") err.push(event.data);
        else {
          code =
            event.result.status === "exited" ? event.result.exitCode : SANDBOX_TIMEOUT_EXIT_CODE;
        }
      }
    } catch (error) {
      // A command we aborted on purpose is not an error worth reporting to the agent.
      if (!abort.signal.aborted) {
        // The sandbox went away mid-command: report it where the agent will read it.
        const text = error instanceof Error ? error.message : String(error);
        err.push(new TextEncoder().encode(`\nsandbox error: ${text}\n`));
      }
    } finally {
      out.close();
      err.close();
    }
    return code;
  })();
  const process: RunningProcess = {
    stdout: out.stream,
    stderr: err.stream,
    exited,
    // Aborting the call has the daemon stop the command; SIGTERM and SIGKILL are the same to it.
    signal: () => abort.abort(),
  };
  return process;
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
    "-e",
    `ANVIA_SANDBOX_COMMAND_TIMEOUT_MS=${DAEMON_COMMAND_TIMEOUT_MS}`,
  ];
  if (input.user) args.push("--user", input.user);
  args.push(input.image);
  return args;
}

/** What a runner needs to run a thread: its workspace, where commands run, and extra tools. */
export interface ThreadWorkspaces {
  acquire(thread: { id: string }): Promise<ThreadSandbox>;
  /** Frees what a thread holds (its container); its workspace files stay for the next `acquire`. */
  release(threadId: string): Promise<void>;
  dispose(): Promise<void>;
}

// Runs an agent's commands in a Docker container instead of on the host (decisions 0009, 0010). Each
// thread gets its own container from a desktop image, with an empty workspace directory the runner
// manages mounted at /workspace, so the file tools (on the runner, confined to that directory) and
// the shell (in the container) see the same files and nothing else of the runner's.
// A daemon in the container dials out to a hub in this process, authenticated by a one-container
// token; the control plane is not involved.
export class Sandboxes implements ThreadWorkspaces {
  #config: SandboxConfig;
  #hub: RemoteSandboxHub;
  #port: number;
  #tokens: Map<string, string>;
  #run: Docker;
  #running = new Set<string>();
  #roots = new Map<string, string>();
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

  async acquire(thread: { id: string }): Promise<ThreadSandbox> {
    const root = await this.#workspace(thread.id);
    await this.#ensure(thread.id, root);
    const runtime = this.#hub.runtime(thread.id, { workdir: WORKDIR });
    const launcher: Launcher = ({ command, cwd, env }) => {
      const abort = new AbortController();
      const events = runtime.execStream({
        command: "bash",
        args: ["-c", command],
        cwd: containerPath(root, cwd),
        env: { ...env, AGENT: "1" },
        abortSignal: abort.signal,
      });
      return toProcess(events, abort);
    };
    return {
      root,
      launcher,
      tools: createDesktopTools({ sandbox: this.#hub.desktop(thread.id) }),
    };
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

  // The thread's empty workspace, created on first use and kept for its later runs. Real path,
  // so the file tools' confinement and the bind mount agree on what the directory is.
  async #workspace(threadId: string) {
    const known = this.#roots.get(threadId);
    if (known) return known;
    const home = this.#config.home ?? join(homedir(), ".aven", "runtime");
    const dir = join(home, "workspaces", threadId);
    await mkdir(dir, { recursive: true });
    const root = await realpath(dir);
    this.#roots.set(threadId, root);
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
