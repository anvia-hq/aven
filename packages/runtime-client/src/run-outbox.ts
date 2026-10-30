import { Database } from "bun:sqlite";
import type { RuntimeToControlPlane } from "@aven/protocol/runtime-wire";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

// The most a run keeps for a reconnect. A run that outgrows it while the link is down cannot be
// replayed from the start; the newest events are what a client needs.
const MAX_ENTRIES = 20_000;

/** Where a message came from in the journal, so a restarted runner knows where to pick up. */
export type Source = { id: string; sequence: number };

// What a run has told the control plane, numbered, until the control plane says it has the end.
// A run keeps working while the link is down; when it comes back the control plane asks for
// everything after the last event it heard. It is on disk, so the same holds when the runner
// restarts (decisions 0023 and 0024).
export class RunOutbox {
  #db: Database;
  // The next number of each run, and whether the control plane has asked for it since the
  // connection came up. Neither outlives the process.
  #next = new Map<string, number>();
  #attached = new Set<string>();

  constructor(db: Database) {
    this.#db = db;
    db.run(`create table if not exists outbox (
      run_id text not null, seq integer not null, message text not null,
      source text, source_sequence integer,
      primary key (run_id, seq)
    )`);
    db.run("create index if not exists outbox_source on outbox (run_id, source, source_sequence)");
    // A run exists from the moment it starts, before it has said anything.
    db.run("create table if not exists outbox_runs (run_id text primary key)");
    for (const row of db.query<{ run_id: string }, []>("select run_id from outbox_runs").all())
      this.#next.set(row.run_id, 1);
    for (const row of db
      .query<{ run_id: string; last: number }, []>(
        "select run_id, max(seq) as last from outbox group by run_id",
      )
      .all())
      this.#next.set(row.run_id, row.last + 1);
  }

  /** Starts a run's log, already attached: it began on the connection that is up. */
  open(runId: string) {
    this.#next.set(runId, this.#next.get(runId) ?? 1);
    this.#attached.add(runId);
    this.#db.query("insert or ignore into outbox_runs (run_id) values (?)").run(runId);
  }

  /** Numbers and keeps a message of the run; null when the run is not in the outbox (it was forgotten). */
  push(runId: string, make: (seq: number) => RuntimeToControlPlane, source?: Source) {
    const seq = this.#next.get(runId);
    if (seq === undefined) return null;
    this.#next.set(runId, seq + 1);
    const message = make(seq);
    this.#db
      .query(
        "insert into outbox (run_id, seq, message, source, source_sequence) values (?, ?, ?, ?, ?)",
      )
      .run(runId, seq, JSON.stringify(message), source?.id ?? null, source?.sequence ?? null);
    if (seq > MAX_ENTRIES)
      this.#db
        .query("delete from outbox where run_id = ? and seq <= ?")
        .run(runId, seq - MAX_ENTRIES);
    return message;
  }

  /** The newest journal event of `sourceId` this run has already told the control plane about. */
  cursor(runId: string, sourceId: string) {
    return (
      this.#db
        .query<{ last: number | null }, [string, string]>(
          "select max(source_sequence) as last from outbox where run_id = ? and source = ?",
        )
        .get(runId, sourceId)?.last ?? 0
    );
  }

  /** Whether live messages of the run may be sent now, or are waiting for the control plane to ask. */
  attached(runId: string) {
    return this.#attached.has(runId);
  }

  /** The connection dropped and came back: every run waits to be asked for again. */
  detachAll() {
    this.#attached.clear();
  }

  /** The control plane follows this run and has everything up to `after`: what it lacks, and live from here. */
  attach(runId: string, after: number) {
    if (!this.#next.has(runId)) return [];
    this.#attached.add(runId);
    return this.#db
      .query<{ message: string }, [string, number]>(
        "select message from outbox where run_id = ? and seq > ? order by seq",
      )
      .all(runId, after)
      .map((row) => JSON.parse(row.message) as RuntimeToControlPlane);
  }

  ack(runId: string) {
    this.#next.delete(runId);
    this.#attached.delete(runId);
    this.#db.query("delete from outbox where run_id = ?").run(runId);
    this.#db.query("delete from outbox_runs where run_id = ?").run(runId);
  }

  ids() {
    return [...this.#next.keys()];
  }
}

export function openRunDatabase(path: string) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true });
  // It holds the model grants of runs in flight: the runner's own, no one else's.
  if (path !== ":memory:") chmodSync(path, 0o600);
  // Events arrive many a second; a crash may lose the last few, and the journal has them.
  db.run("pragma journal_mode = wal");
  db.run("pragma synchronous = normal");
  return db;
}
