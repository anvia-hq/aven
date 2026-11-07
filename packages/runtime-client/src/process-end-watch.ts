import type { ProcessEnded, RuntimeToControlPlane } from "@aven/protocol/runtime-wire";

import type { ThreadSandbox } from "./sandbox";

const POLL_MS = 3000;
const TAIL_CHARS = 4000;
const COMMAND_CHARS = 500;

export type ProcessEndWatchContext = {
  box(threadId: string): ThreadSandbox | undefined;
  send(message: RuntimeToControlPlane): boolean;
  hasRun(threadId: string): boolean;
  stopped(): boolean;
  pollMs?: number;
};

const processesOf = (box: ThreadSandbox) =>
  Promise.resolve()
    .then(() => box.processes.list())
    .catch(() => undefined);

export class ProcessEndWatch {
  #threads = new Map<
    string,
    { since: number; told: Set<string>; timer: Timer; looking: boolean }
  >();

  constructor(private context: ProcessEndWatchContext) {}

  arm(threadId: string) {
    if (this.#threads.has(threadId) || this.context.stopped()) return;
    const timer = setInterval(() => void this.#look(threadId), this.context.pollMs ?? POLL_MS);
    this.#threads.set(threadId, { since: Date.now(), told: new Set(), timer, looking: false });
  }

  settle(threadId: string) {
    void this.#look(threadId);
  }

  disarm(threadId: string) {
    const watch = this.#threads.get(threadId);
    if (!watch) return;
    clearInterval(watch.timer);
    this.#threads.delete(threadId);
  }

  ignore(threadId: string, processId: string) {
    this.#threads.get(threadId)?.told.add(processId);
  }

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
