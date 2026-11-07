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

type Watch = {
  /** What the thread's sandbox already had when the watch began: not this watch's to tell. */
  baseline: Set<string>;
  /** Running processes the watch follows, for the end it will tell. */
  tracked: Set<string>;
  /** Told of, or stopped by the person. */
  told: Set<string>;
  /** Looking now; null while the watch is suspended. */
  timer: Timer | null;
  ready: Promise<void>;
  looking: boolean;
};

// Watches the processes the agent starts in a thread and tells the control plane when one ends, so
// the agent is told as Claude Code's is: a thread that is idle is woken, and a run that is going
// hears it at its next step (decisions 0144 and 0147). The agent never has to wait: it starts a
// process, ends its turn, and carries on when told. A watch starts with a run, follows what the
// sandbox did not have before it (by process id, not by a clock: the sandbox's clock is not the
// host's), and goes when the thread has no run and none of its processes is running. A run that
// stops on a question, or is stopped, only suspends it: a process still running is followed when
// the next run starts, and told of then if it ended meanwhile.
export class ProcessEndWatch {
  #threads = new Map<string, Watch>();

  constructor(private context: ProcessEndWatchContext) {}

  /** A run is starting: watches what it starts, and what an earlier run left running. */
  arm(threadId: string) {
    if (this.context.stopped()) return;
    const kept = this.#threads.get(threadId);
    if (kept?.timer) return;
    const watch: Watch = kept ?? {
      baseline: new Set(),
      tracked: new Set(),
      told: new Set(),
      timer: null,
      ready: Promise.resolve(),
      looking: false,
    };
    if (!kept) {
      const box = this.context.box(threadId);
      if (box) {
        watch.ready = processesOf(box).then((list) => {
          for (const process of list ?? []) watch.baseline.add(process.id);
        });
      }
    }
    watch.timer = setInterval(() => void this.#look(threadId), this.context.pollMs ?? POLL_MS);
    this.#threads.set(threadId, watch);
  }

  /** The run ran to its end: looks at once, for a process that ended during it, and goes on after. */
  settle(threadId: string) {
    void this.#look(threadId);
  }

  /**
   * The run stopped on a question, failed or was stopped: nothing is told while the thread waits,
   * and a process still running is followed again when the next run starts.
   */
  suspend(threadId: string) {
    const watch = this.#threads.get(threadId);
    if (!watch) return;
    if (watch.timer) clearInterval(watch.timer);
    watch.timer = null;
    if (watch.tracked.size === 0) this.#threads.delete(threadId);
  }

  /** The thread's sandbox is gone: nothing is told. */
  disarm(threadId: string) {
    const watch = this.#threads.get(threadId);
    if (!watch) return;
    if (watch.timer) clearInterval(watch.timer);
    watch.timer = null;
    this.#threads.delete(threadId);
  }

  /** The person stopped this one themselves: the agent is not woken for it. */
  ignore(threadId: string, processId: string) {
    const watch = this.#threads.get(threadId);
    watch?.told.add(processId);
    watch?.tracked.delete(processId);
  }

  /** Stops every watch, for a runner that is shutting down. */
  cancelAll() {
    for (const threadId of this.#threads.keys()) this.disarm(threadId);
  }

  async #look(threadId: string) {
    const watch = this.#threads.get(threadId);
    if (!watch?.timer || watch.looking) return;
    const box = this.context.box(threadId);
    if (this.context.stopped() || (!box && !this.context.hasRun(threadId))) {
      this.disarm(threadId);
      return;
    }
    if (!box) return;
    watch.looking = true;
    try {
      await watch.ready;
      const list = await processesOf(box);
      if (!list || this.#threads.get(threadId) !== watch || !watch.timer) return;
      for (const process of list) {
        if (watch.told.has(process.id)) continue;
        if (watch.baseline.has(process.id) && !watch.tracked.has(process.id)) continue;
        if (process.status === "running") {
          watch.tracked.add(process.id);
          continue;
        }
        const logs = await Promise.resolve()
          .then(() => box.processes.logs(process.id))
          .catch(() => ({ stdout: "", stderr: "", truncated: false }));
        if (this.#threads.get(threadId) !== watch || !watch.timer) return;
        watch.told.add(process.id);
        watch.tracked.delete(process.id);
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
      if (watch.tracked.size === 0 && !this.context.hasRun(threadId)) this.disarm(threadId);
    } finally {
      watch.looking = false;
    }
  }
}
