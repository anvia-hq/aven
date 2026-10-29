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

// Keeps the tail of very chatty jobs so a runaway process cannot exhaust memory.
const MAX_BUFFER_CHARS = 2_000_000;
const KILL_GRACE_MS = 2_000;
// Wait this long for stdout/stderr to drain after exit; a backgrounded grandchild can hold the pipes open.
const DRAIN_GRACE_MS = 250;
const MAX_FINISHED_JOBS = 50;

class BoundedOutput {
  text = "";

  append(chunk: string) {
    this.text += chunk;
    if (this.text.length > MAX_BUFFER_CHARS) this.text = this.text.slice(-MAX_BUFFER_CHARS);
  }
}

type Entry = {
  snapshot: JobSnapshot;
  output: BoundedOutput;
  proc: RunningProcess;
  done: Promise<JobSnapshot>;
  /** The process has exited; the job is only draining its pipes and notifying listeners. */
  exited: boolean;
  killed: boolean;
  timedOut: boolean;
  killTimer?: ReturnType<typeof setTimeout>;
};

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
    const completion = Promise.withResolvers<JobSnapshot>();
    const entry: Entry = {
      snapshot: {
        id,
        command: options.command,
        cwd: options.cwd,
        background: options.background ?? false,
        status: "running",
        exitCode: null,
        startedAt: Date.now(),
        endedAt: null,
        output: "",
      },
      output: new BoundedOutput(),
      proc: this.#launch({ command: options.command, cwd: options.cwd, env: options.env }),
      done: completion.promise,
      exited: false,
      killed: false,
      timedOut: false,
    };
    this.#entries.set(id, entry);
    void this.#watch(entry, options.timeoutMs).then(completion.resolve, completion.reject);
    return { id, done: entry.done };
  }

  snapshot(id: string): JobSnapshot | undefined {
    const entry = this.#entries.get(id);
    return entry && viewOf(entry);
  }

  list() {
    return [...this.#entries.values()].map(viewOf);
  }

  // Resolves once the job has exited. Returns false if the job is unknown or already finished.
  async kill(id: string) {
    const entry = this.#entries.get(id);
    if (!entry || entry.snapshot.status !== "running") return false;
    if (entry.exited) {
      await entry.done;
      return false;
    }
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

  // Synchronous SIGKILL of every running job, for `process.on("exit")` where nothing can be awaited.
  killAllNow() {
    for (const entry of this.#entries.values()) {
      if (entry.snapshot.status === "running") entry.proc.signal("SIGKILL");
    }
  }

  // Follows the process to its end and settles the job: output, status, listeners.
  async #watch(entry: Entry, timeoutMs: number | undefined) {
    const { proc, output } = entry;
    const drained = Promise.all([pump(proc.stdout, output), pump(proc.stderr, output)]).catch(
      () => undefined,
    );
    const timeout = timeoutMs
      ? setTimeout(() => {
          entry.timedOut = true;
          this.#terminate(entry);
        }, timeoutMs)
      : undefined;

    const exitCode = await proc.exited.catch((error: unknown) => {
      output.append(`\nprocess error: ${error instanceof Error ? error.message : String(error)}\n`);
      return null;
    });
    entry.exited = true;
    await Promise.race([drained, Bun.sleep(DRAIN_GRACE_MS)]);
    clearTimeout(timeout);
    clearTimeout(entry.killTimer);

    entry.snapshot.exitCode = exitCode;
    entry.snapshot.endedAt = Date.now();
    entry.snapshot.status = finalStatus(entry, exitCode);
    this.#prune();
    const view = viewOf(entry);
    for (const listener of this.#listeners) {
      try {
        listener({ ...view });
      } catch {
        // A misbehaving listener must not break job bookkeeping.
      }
    }
    return view;
  }

  // SIGTERM the group, then SIGKILL it if the command ignores that.
  #terminate(entry: Entry) {
    entry.proc.signal("SIGTERM");
    entry.killTimer ??= setTimeout(() => entry.proc.signal("SIGKILL"), KILL_GRACE_MS);
  }

  // Forgets the oldest finished jobs once there are too many.
  #prune() {
    const finished = [...this.#entries.values()]
      .filter((entry) => entry.snapshot.status !== "running")
      .sort((a, b) => (a.snapshot.endedAt ?? 0) - (b.snapshot.endedAt ?? 0));
    for (const entry of finished.slice(0, Math.max(0, finished.length - MAX_FINISHED_JOBS))) {
      this.#entries.delete(entry.snapshot.id);
    }
  }
}

// Read from the start so `shell_output` sees logs while the job is still running.
async function pump(stream: ReadableStream<Uint8Array>, output: BoundedOutput) {
  const decoder = new TextDecoder();
  for await (const chunk of stream) output.append(decoder.decode(chunk, { stream: true }));
  output.append(decoder.decode());
}

function viewOf(entry: Entry): JobSnapshot {
  return { ...entry.snapshot, output: entry.output.text };
}

function finalStatus(entry: Entry, exitCode: number | null): JobStatus {
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
