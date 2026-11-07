import type { ProcessEnded, RuntimeToControlPlane } from "@aven/protocol/runtime-wire";

import type { ThreadSandbox } from "./sandbox";

const POLL_MS = 3000;
// How much of each stream goes in the note: the end of it, which is what the process last said.
const TAIL_CHARS = 4000;
const COMMAND_CHARS = 500;

export type ProcessEndWatchContext = {
  /** The sandbox of a thread, while it has one. */
  box(threadId: string): ThreadSandbox | undefined;
  /** False when the link is down and the message went nowhere. */
  send(message: RuntimeToControlPlane): boolean;
  /** A run or a bot's reply is using the thread: its own agent sees its processes. */
  hasRun(threadId: string): boolean;
  stopped(): boolean;
  pollMs?: number;
};

// Watches the processes the agent left running when its run ended, and tells the control plane when
// one ends while the thread is idle, so the agent is woken and carries on (decision 0144). It
// watches only an idle thread: a run sees its own processes, and a new run drops the watch, which
// the run's end sets again with what is then running.
export class ProcessEndWatch {
  #threads = new Map<string, { ids: Set<string>; timer: Timer }>();

  constructor(private context: ProcessEndWatchContext) {}

  /** The thread's run is over: watches what it left running. */
  async arm(threadId: string) {
    this.disarm(threadId);
    if (this.context.stopped()) return;
    const box = this.context.box(threadId);
    if (!box) return;
    const running = await box.processes
      .list()
      .then((list) => list.filter((process) => process.status === "running"))
      .catch(() => []);
    if (running.length === 0 || this.context.stopped() || this.context.hasRun(threadId)) return;
    this.disarm(threadId);
    const ids = new Set(running.map((process) => process.id));
    const timer = setInterval(() => void this.#look(threadId), this.context.pollMs ?? POLL_MS);
    this.#threads.set(threadId, { ids, timer });
  }

  /** A run is starting, or the thread's sandbox is gone: nothing is told about its processes. */
  disarm(threadId: string) {
    const watch = this.#threads.get(threadId);
    if (!watch) return;
    clearInterval(watch.timer);
    this.#threads.delete(threadId);
  }

  /** The person stopped this one themselves: the agent is not woken for it. */
  ignore(threadId: string, processId: string) {
    const watch = this.#threads.get(threadId);
    watch?.ids.delete(processId);
    if (watch && watch.ids.size === 0) this.disarm(threadId);
  }

  /** Stops every watch, for a runner that is shutting down. */
  cancelAll() {
    for (const threadId of this.#threads.keys()) this.disarm(threadId);
  }

  async #look(threadId: string) {
    const watch = this.#threads.get(threadId);
    if (!watch) return;
    const box = this.context.box(threadId);
    if (this.context.stopped() || !box || this.context.hasRun(threadId)) {
      this.disarm(threadId);
      return;
    }
    const list = await box.processes.list().catch(() => undefined);
    if (!list) return;
    for (const id of watch.ids) {
      const process = list.find((candidate) => candidate.id === id);
      // Gone from the sandbox (it was released): nothing left to tell of.
      if (!process) {
        watch.ids.delete(id);
        continue;
      }
      if (process.status === "running") continue;
      watch.ids.delete(id);
      const logs = await box.processes
        .logs(id)
        .catch(() => ({ stdout: "", stderr: "", truncated: false }));
      const started = Date.parse(process.startedAt);
      const ended = process.endedAt ? Date.parse(process.endedAt) : Date.now();
      const message: ProcessEnded = {
        threadId,
        processId: id,
        command: process.command.slice(0, COMMAND_CHARS),
        status: process.status,
        exitCode: process.exitCode ?? null,
        ranSeconds: Math.max(0, Math.round((ended - started) / 1000)),
        stdout: logs.stdout.slice(-TAIL_CHARS),
        stderr: logs.stderr.slice(-TAIL_CHARS),
      };
      this.context.send({ type: "process.ended", ...message });
    }
    if (watch.ids.size === 0) this.disarm(threadId);
  }
}
