import type { Database } from "bun:sqlite";
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

type KeptWatch = {
  baseline: readonly string[];
  tracked: readonly string[];
  told: readonly string[];
};

type WatchStore = {
  load(threadId: string): KeptWatch | undefined;
  save(threadId: string, watch: KeptWatch): void;
  clear(threadId: string): void;
};

export class ProcessWatchRecords implements WatchStore {
  #db: Database;

  constructor(db: Database) {
    this.#db = db;
    db.run(
      "create table if not exists process_watch (thread_id text primary key, state text not null)",
    );
  }

  load(threadId: string) {
    const row = this.#db
      .query<{ state: string }, [string]>("select state from process_watch where thread_id = ?")
      .get(threadId);
    if (!row) return undefined;
    let state: Partial<KeptWatch>;
    try {
      state = JSON.parse(row.state) as Partial<KeptWatch>;
    } catch {
      return undefined;
    }
    return {
      baseline: state.baseline ?? [],
      tracked: state.tracked ?? [],
      told: state.told ?? [],
    };
  }

  save(threadId: string, watch: KeptWatch) {
    this.#db
      .query("insert or replace into process_watch (thread_id, state) values (?, ?)")
      .run(threadId, JSON.stringify(watch));
  }

  clear(threadId: string) {
    this.#db.query("delete from process_watch where thread_id = ?").run(threadId);
  }
}

export class ProcessEndWatch {
  #threads = new Map<string, Watch>();

  constructor(
    private context: ProcessEndWatchContext,
    private store?: WatchStore,
  ) {}

  arm(threadId: string) {
    if (this.context.stopped()) return Promise.resolve();
    const kept = this.#threads.get(threadId);
    if (kept?.timer) return kept.ready;
    const saved = kept ? undefined : this.store?.load(threadId);
    const watch: Watch = kept ?? {
      baseline: new Set(saved?.baseline),
      tracked: new Set(saved?.tracked),
      told: new Set(saved?.told),
      timer: null,
      ready: Promise.resolve(),
      looking: false,
    };
    if (!kept) watch.ready = this.#prepare(threadId, watch, saved !== undefined);
    watch.timer = setInterval(() => void this.#look(threadId), this.context.pollMs ?? POLL_MS);
    this.#threads.set(threadId, watch);
    return watch.ready;
  }

  settle(threadId: string) {
    void this.#look(threadId);
  }

  suspend(threadId: string) {
    const watch = this.#threads.get(threadId);
    if (!watch) return;
    if (watch.timer) clearInterval(watch.timer);
    watch.timer = null;
    if (watch.tracked.size > 0) return;
    this.#threads.delete(threadId);
    this.store?.clear(threadId);
  }

  disarm(threadId: string) {
    this.#stop(threadId);
    this.store?.clear(threadId);
  }

  ignore(threadId: string, processId: string) {
    const watch = this.#threads.get(threadId);
    if (!watch) return;
    watch.told.add(processId);
    watch.tracked.delete(processId);
    this.#remember(threadId, watch);
  }

  cancelAll() {
    for (const threadId of this.#threads.keys()) this.#stop(threadId);
  }

  #stop(threadId: string) {
    const watch = this.#threads.get(threadId);
    if (!watch) return;
    if (watch.timer) clearInterval(watch.timer);
    watch.timer = null;
    this.#threads.delete(threadId);
  }

  #prepare(threadId: string, watch: Watch, restored: boolean) {
    const box = this.context.box(threadId);
    if (!box) return Promise.resolve();
    return processesOf(box).then((list) => {
      if (!list) return;
      if (restored) {
        const there = new Set(list.map((process) => process.id));
        for (const id of watch.tracked) if (!there.has(id)) watch.tracked.delete(id);
      } else {
        for (const process of list) watch.baseline.add(process.id);
      }
      this.#remember(threadId, watch);
    });
  }

  #remember(threadId: string, watch: Watch) {
    if (!this.store) return;
    if (watch.baseline.size === 0 && watch.tracked.size === 0 && watch.told.size === 0) {
      this.store.clear(threadId);
      return;
    }
    this.store.save(threadId, {
      baseline: [...watch.baseline],
      tracked: [...watch.tracked],
      told: [...watch.told],
    });
  }

  async #look(threadId: string) {
    const watch = this.#threads.get(threadId);
    if (!watch?.timer || watch.looking) return;
    const box = this.context.box(threadId);
    if (this.context.stopped()) {
      this.#stop(threadId);
      return;
    }
    if (!box && !this.context.hasRun(threadId)) {
      this.disarm(threadId);
      return;
    }
    if (!box) return;
    watch.looking = true;
    let changed = false;
    try {
      await watch.ready;
      const list = await processesOf(box);
      if (!list || this.#threads.get(threadId) !== watch || !watch.timer) return;
      for (const process of list) {
        if (watch.told.has(process.id)) continue;
        if (watch.baseline.has(process.id) && !watch.tracked.has(process.id)) continue;
        if (process.status === "running") {
          if (!watch.tracked.has(process.id)) {
            watch.tracked.add(process.id);
            changed = true;
          }
          continue;
        }
        const logs = await Promise.resolve()
          .then(() => box.processes.logs(process.id))
          .catch(() => ({ stdout: "", stderr: "", truncated: false }));
        if (this.#threads.get(threadId) !== watch || !watch.timer) return;
        watch.told.add(process.id);
        watch.tracked.delete(process.id);
        changed = true;
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
      if (changed) this.#remember(threadId, watch);
      if (watch.tracked.size === 0 && !this.context.hasRun(threadId)) this.disarm(threadId);
    } finally {
      watch.looking = false;
    }
  }
}
