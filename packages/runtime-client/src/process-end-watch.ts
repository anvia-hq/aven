import type { ProcessEnded } from "@aven/protocol/types";
import type { ProcessEndWatchContext, ThreadSandbox } from "./types";

const POLL_MS = 3000;
const TAIL_CHARS = 4000;
const COMMAND_CHARS = 500;

const processesOf = (box: ThreadSandbox) =>
  Promise.resolve()
    .then(() => box.processes.list())
    .catch(() => undefined);

type Watch = {
  baseline: Set<string>;
  tracked: Set<string>;
  told: Set<string>;
  timer: Timer | null;
  ready: Promise<void>;
  looking: boolean;
};

export class ProcessEndWatch {
  #threads = new Map<string, Watch>();

  constructor(private context: ProcessEndWatchContext) {}

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

  settle(threadId: string) {
    void this.#look(threadId);
  }

  suspend(threadId: string) {
    const watch = this.#threads.get(threadId);
    if (!watch) return;
    if (watch.timer) clearInterval(watch.timer);
    watch.timer = null;
    if (watch.tracked.size === 0) this.#threads.delete(threadId);
  }

  disarm(threadId: string) {
    const watch = this.#threads.get(threadId);
    if (!watch) return;
    if (watch.timer) clearInterval(watch.timer);
    watch.timer = null;
    this.#threads.delete(threadId);
  }

  ignore(threadId: string, processId: string) {
    const watch = this.#threads.get(threadId);
    watch?.told.add(processId);
    watch?.tracked.delete(processId);
  }

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
