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
  /** A run or a bot's reply is using the thread: the watch stays while there is one. */
  hasRun(threadId: string): boolean;
  stopped(): boolean;
  pollMs?: number;
};

// The sandbox's processes, or nothing when it cannot say: a watch in the background never throws.
const processesOf = (box: ThreadSandbox) =>
  Promise.resolve()
    .then(() => box.processes.list())
    .catch(() => undefined);

// Watches the processes the agent starts in a thread and tells the control plane when one ends, so
// the agent is told as Claude Code's is: a thread that is idle is woken, and a run that is going
// hears it at its next step (decisions 0144 and 0147). The agent never has to wait: it starts a
// process, ends its turn, and carries on when told. A watch starts with a run, is for the processes
// started since, and goes when the thread has a run no more and none of them is running.
export class ProcessEndWatch {
  #threads = new Map<
    string,
    { since: number; told: Set<string>; timer: Timer; looking: boolean }
  >();

  constructor(private context: ProcessEndWatchContext) {}

  /** A run is starting: watches what it starts, and what an earlier run left running. */
  arm(threadId: string) {
    if (this.#threads.has(threadId) || this.context.stopped()) return;
    const timer = setInterval(() => void this.#look(threadId), this.context.pollMs ?? POLL_MS);
    this.#threads.set(threadId, { since: Date.now(), told: new Set(), timer, looking: false });
  }

  /** The run ran to its end: looks at once, for a process that ended during it, and goes on after. */
  settle(threadId: string) {
    void this.#look(threadId);
  }

  /** The run was stopped or failed, or the thread's sandbox is gone: nothing is told. */
  disarm(threadId: string) {
    const watch = this.#threads.get(threadId);
    if (!watch) return;
    clearInterval(watch.timer);
    this.#threads.delete(threadId);
  }

  /** The person stopped this one themselves: the agent is not woken for it. */
  ignore(threadId: string, processId: string) {
    this.#threads.get(threadId)?.told.add(processId);
  }

  /** Stops every watch, for a runner that is shutting down. */
  cancelAll() {
    for (const threadId of this.#threads.keys()) this.disarm(threadId);
  }

  async #look(threadId: string) {
    const watch = this.#threads.get(threadId);
    if (!watch || watch.looking) return;
    const box = this.context.box(threadId);
    if (this.context.stopped() || (!box && !this.context.hasRun(threadId))) {
      this.disarm(threadId);
      return;
    }
    if (!box) return;
    watch.looking = true;
    try {
      const list = await processesOf(box);
      if (!list || this.#threads.get(threadId) !== watch) return;
      let going = false;
      for (const process of list) {
        // One an earlier run left is from before the watch began, and is not this watch's to tell.
        if (watch.told.has(process.id) || Date.parse(process.startedAt) < watch.since) continue;
        if (process.status === "running") {
          going = true;
          continue;
        }
        watch.told.add(process.id);
        const logs = await Promise.resolve()
          .then(() => box.processes.logs(process.id))
          .catch(() => ({ stdout: "", stderr: "", truncated: false }));
        const started = Date.parse(process.startedAt);
        const ended = process.endedAt ? Date.parse(process.endedAt) : Date.now();
        const message: ProcessEnded = {
          threadId,
          processId: process.id,
          command: process.command.slice(0, COMMAND_CHARS),
          status: process.status,
          exitCode: process.exitCode ?? null,
          ranSeconds: Math.max(0, Math.round((ended - started) / 1000)),
          stdout: logs.stdout.slice(-TAIL_CHARS),
          stderr: logs.stderr.slice(-TAIL_CHARS),
        };
        this.context.send({ type: "process.ended", ...message });
      }
      if (!going && !this.context.hasRun(threadId)) this.disarm(threadId);
    } finally {
      watch.looking = false;
    }
  }
}
