import { truncateTail } from "../lib/truncate";

export type JobStatus = "running" | "completed" | "failed" | "timeout" | "killed";

export type JobSnapshot = {
  id: string;
  command: string;
  cwd: string;
  background: boolean;
  status: JobStatus;
  exitCode: number | null;
  startedAt: number;
  endedAt: number | null;
  output: string;
};

export type StartJobOptions = {
  command: string;
  cwd: string;
  /** Kill the job after this many milliseconds. 0 or omitted means no timeout. */
  timeoutMs?: number;
  /** Background jobs outlive the tool call that started them. */
  background?: boolean;
  env?: Record<string, string>;
};

// A started command, however it is run: on this machine, or inside a sandbox.
export type RunningProcess = {
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  /** The exit code once the command is over. */
  exited: Promise<number>;
  /** Asks the command, and what it spawned, to stop. Calling it again after the process is gone is harmless. */
  signal(signal: "SIGTERM" | "SIGKILL"): void;
};

/** Starts `command` in `cwd`. Replace it to run commands somewhere other than this machine. */
export type Launcher = (input: {
  command: string;
  cwd: string;
  env?: Record<string, string>;
}) => RunningProcess;

// Runs the command as a process group on this machine, so a signal reaches its children too.
export const hostLauncher: Launcher = ({ command, cwd, env }) => {
  const proc = Bun.spawn([Bun.which("bash") ?? "/bin/sh", "-c", command], {
    cwd,
    env: { ...process.env, ...env, AGENT: "1" },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    detached: true,
  });
  return {
    stdout: proc.stdout,
    stderr: proc.stderr,
    exited: proc.exited,
    signal(signal) {
      try {
        process.kill(-proc.pid, signal);
      } catch {
        try {
          proc.kill(signal);
        } catch {
          // Already gone.
        }
      }
    },
  };
};

type Entry = {
  snapshot: JobSnapshot;
  proc: RunningProcess;
  done: Promise<JobSnapshot>;
  killed: boolean;
  timedOut: boolean;
  killTimer?: ReturnType<typeof setTimeout>;
};

// Keep the tail of very chatty jobs so a runaway process cannot exhaust memory.
const MAX_BUFFER_CHARS = 2_000_000;
const KILL_GRACE_MS = 2_000;
// Wait this long for stdout/stderr to drain after exit; a backgrounded grandchild can hold the pipes open.
const DRAIN_GRACE_MS = 250;
const MAX_FINISHED_JOBS = 50;

// Runs shell commands as process groups, so killing a job also kills what it spawned
// (e.g. the children of `bun run dev`). Owns the lifecycle; the shell tools are thin wrappers.
export class JobRegistry {
  #launch: Launcher;
  #entries = new Map<string, Entry>();
  #listeners = new Set<(job: JobSnapshot) => void>();

  constructor(options: { launcher?: Launcher } = {}) {
    this.#launch = options.launcher ?? hostLauncher;
  }

  start(options: StartJobOptions) {
    const id = `job_${crypto.randomUUID().slice(0, 8)}`;
    const snapshot: JobSnapshot = {
      id,
      command: options.command,
      cwd: options.cwd,
      background: options.background ?? false,
      status: "running",
      exitCode: null,
      startedAt: Date.now(),
      endedAt: null,
      output: "",
    };

    const proc = this.#launch({ command: options.command, cwd: options.cwd, env: options.env });

    const entry: Entry = {
      snapshot,
      proc,
      killed: false,
      timedOut: false,
      done: undefined as unknown as Promise<JobSnapshot>,
    };

    const append = (text: string) => {
      snapshot.output += text;
      if (snapshot.output.length > MAX_BUFFER_CHARS) {
        snapshot.output = snapshot.output.slice(-MAX_BUFFER_CHARS);
      }
    };
    const pump = async (stream: ReadableStream<Uint8Array>) => {
      const decoder = new TextDecoder();
      for await (const chunk of stream) append(decoder.decode(chunk, { stream: true }));
      append(decoder.decode());
    };

    // Read from the start so `shell_output` sees logs while the job is still running.
    const drained = Promise.all([pump(proc.stdout), pump(proc.stderr)]).catch(() => undefined);

    const timeout = options.timeoutMs
      ? setTimeout(() => {
          entry.timedOut = true;
          this.#terminate(entry);
        }, options.timeoutMs)
      : undefined;

    entry.done = (async () => {
      const exitCode = await proc.exited;
      await Promise.race([drained, Bun.sleep(DRAIN_GRACE_MS)]);
      clearTimeout(timeout);
      clearTimeout(entry.killTimer);

      snapshot.exitCode = exitCode;
      snapshot.endedAt = Date.now();
      snapshot.status = finalStatus(entry, exitCode);
      this.#prune();
      for (const listener of this.#listeners) {
        try {
          listener({ ...snapshot });
        } catch {
          // A misbehaving listener must not break job bookkeeping.
        }
      }
      return { ...snapshot };
    })();

    this.#entries.set(id, entry);
    return { id, done: entry.done };
  }

  snapshot(id: string): JobSnapshot | undefined {
    const entry = this.#entries.get(id);
    return entry && { ...entry.snapshot };
  }

  list() {
    return [...this.#entries.values()].map((entry) => ({ ...entry.snapshot }));
  }

  // Resolves once the job has exited. Returns false if the job is unknown or already finished.
  async kill(id: string) {
    const entry = this.#entries.get(id);
    if (!entry || entry.snapshot.status !== "running") return false;
    entry.killed = true;
    this.#terminate(entry);
    await entry.done;
    return true;
  }

  forget(id: string) {
    const entry = this.#entries.get(id);
    if (entry && entry.snapshot.status !== "running") this.#entries.delete(id);
  }

  // Fires once for every job that exits (foreground and background). Filter on `background`.
  onComplete(listener: (job: JobSnapshot) => void) {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  // Call on host shutdown so no job outlives the process.
  async disposeAll() {
    await Promise.all([...this.#entries.keys()].map((id) => this.kill(id)));
  }

  // SIGTERM the group, then SIGKILL it if the command ignores that.
  // Synchronous SIGKILL of every running job, for `process.on("exit")` where nothing can be awaited.
  killAllNow() {
    for (const entry of this.#entries.values()) {
      if (entry.snapshot.status === "running") this.#signal(entry, "SIGKILL");
    }
  }

  #terminate(entry: Entry) {
    this.#signal(entry, "SIGTERM");
    entry.killTimer ??= setTimeout(() => this.#signal(entry, "SIGKILL"), KILL_GRACE_MS);
  }

  #signal(entry: Entry, signal: "SIGTERM" | "SIGKILL") {
    entry.proc.signal(signal);
  }

  #prune() {
    const finished = [...this.#entries.values()].filter(
      (entry) => entry.snapshot.status !== "running",
    );
    for (const entry of finished.slice(0, Math.max(0, finished.length - MAX_FINISHED_JOBS))) {
      this.#entries.delete(entry.snapshot.id);
    }
  }
}

function finalStatus(entry: Entry, exitCode: number): JobStatus {
  if (entry.timedOut) return "timeout";
  if (entry.killed) return "killed";
  return exitCode === 0 ? "completed" : "failed";
}

// The text a host injects into a run (e.g. with `stream.steer`) when a background job finishes.
export function formatJobNotice(job: JobSnapshot) {
  const { text, truncated } = truncateTail(job.output);
  const exit = job.exitCode === null ? "" : `, exit ${job.exitCode}`;
  const parts = [
    `Background command finished (job ${job.id}, ${job.status}${exit}): ${job.command}`,
  ];
  if (text) parts.push(truncated ? `[output truncated]\n${text}` : text);
  return parts.join("\n\n");
}
