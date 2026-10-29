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

const WORKDIR = "/workspace";
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
  return ".";
}

// Adapts a sandbox exec stream to the process shape a JobRegistry expects.
function toProcess(events: AsyncIterable<SandboxExecStreamEvent>, abort: AbortController) {
  let out!: ReadableStreamDefaultController<Uint8Array>;
  let err!: ReadableStreamDefaultController<Uint8Array>;
  const stdout = new ReadableStream<Uint8Array>({ start: (c) => void (out = c) });
  const stderr = new ReadableStream<Uint8Array>({ start: (c) => void (err = c) });
  const exited = (async () => {
    let code = 255;
    try {
      for await (const event of events) {
        if (event.type === "stdout") out.enqueue(event.data);
        else if (event.type === "stderr") err.enqueue(event.data);
        else code = event.result.status === "exited" ? event.result.exitCode : 124;
      }
    } catch (error) {
      // The sandbox went away mid-command: report it where the agent will read it.
      const text = error instanceof Error ? error.message : String(error);
      err.enqueue(new TextEncoder().encode(`\nsandbox error: ${text}\n`));
    } finally {
      out.close();
      err.close();
    }
    return code;
  })();
  const process: RunningProcess = {
    stdout,
    stderr,
    exited,
    // Aborting the call has the daemon stop the command; SIGTERM and SIGKILL are the same to it.
    signal: () => abort.abort(),
  };
  return process;
}

/** What a runner needs to run a thread: its workspace, where commands run, and extra tools. */
export interface ThreadWorkspaces {
  acquire(thread: { id: string }): Promise<ThreadSandbox>;
  dispose(): Promise<void>;
}

// Runs an agent's commands in a Docker container instead of on the host (decisions 0009, 0010). Each
// thread gets its own container from a desktop image, with an empty workspace directory the runner
// manages mounted at /workspace, so the file tools (on the runner, confined to that directory) and
// the shell (in the container) see the same files and nothing else of the runner's.
// A daemon in the container dials out to a hub in this process, authenticated by a one-container
// token; the control plane is not involved.
export class Sandboxes implements ThreadWorkspaces {
  #hub: RemoteSandboxHub;
  #port: number;
  #tokens = new Map<string, string>();
  #running = new Set<string>();
  #roots = new Map<string, string>();
  #starting = new Map<string, Promise<void>>();
  #run: NonNullable<SandboxConfig["docker"]>;

  private constructor(
    private config: SandboxConfig,
    hub: RemoteSandboxHub,
    port: number,
  ) {
    this.#hub = hub;
    this.#port = port;
    this.#run = config.docker ?? docker;
  }

  // Fails now, with what to do about it, rather than on the first run.
  static async start(config: SandboxConfig) {
    const check = await (config.docker ?? docker)(["image", "inspect", config.image]).catch(() => ({
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
      connectTimeoutMs: 90_000,
    });
    // The container reaches this port through the host gateway, so it cannot be loopback-only.
    const { port } = await hub.listen({ host: "0.0.0.0", port: 0, path: "/daemon" });
    const sandboxes = new Sandboxes(config, hub, port);
    sandboxes.#tokens = tokens;
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
    this.#running.delete(threadId);
    this.#roots.delete(threadId);
    for (const [token, id] of this.#tokens) if (id === threadId) this.#tokens.delete(token);
    this.#hub.forget(threadId);
    await this.#run(["rm", "-f", this.#name(threadId)]);
  }

  async dispose() {
    await Promise.all([...this.#running.keys()].map((id) => this.release(id)));
    await this.#hub.close();
  }

  // The thread's empty workspace, created on first use and kept for its later runs. Real path,
  // so the file tools' confinement and the bind mount agree on what the directory is.
  async #workspace(threadId: string) {
    const known = this.#roots.get(threadId);
    if (known) return known;
    const home = this.config.home ?? join(homedir(), ".aven", "runtime");
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

  // Starts the thread's container once, even when several runs ask at the same time.
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
    this.#tokens.set(token, threadId);
    const { memoryMb = 2048, cpus = 2, pidsLimit = 512 } = this.config;
    const host = this.config.hostName ?? "host.docker.internal";
    const args = [
      "run",
      "-d",
      "--name",
      name,
      "--label",
      "aven.sandbox=1",
      "--label",
      `aven.thread=${threadId}`,
      "--add-host",
      `${host}:host-gateway`,
      "--memory",
      `${memoryMb}m`,
      "--cpus",
      String(cpus),
      "--pids-limit",
      String(pidsLimit),
      "--shm-size",
      "512m",
      "--security-opt",
      "no-new-privileges",
      "-v",
      `${root}:${WORKDIR}`,
      "-e",
      `ANVIA_CONTROL_URL=ws://${host}:${this.#port}/daemon`,
      "-e",
      `ANVIA_SANDBOX_TOKEN=${token}`,
      "-e",
      `ANVIA_SANDBOX_WORKDIR=${WORKDIR}`,
      "-e",
      `ANVIA_SANDBOX_COMMAND_TIMEOUT_MS=${DAEMON_COMMAND_TIMEOUT_MS}`,
    ];
    // On Linux a bind mount keeps host ownership, so files must be written as the host user.
    if (process.platform === "linux" && process.getuid && process.getgid) {
      args.push("--user", `${process.getuid()}:${process.getgid()}`);
    }
    args.push(this.config.image);

    const started = await this.#run(args);
    if (started.code !== 0) {
      this.#tokens.delete(token);
      throw new Error(`Could not start the sandbox: ${started.stderr.trim() || started.stdout}`);
    }
    this.#running.add(threadId);
  }
}
