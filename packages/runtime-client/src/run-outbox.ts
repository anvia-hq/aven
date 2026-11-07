import { Database } from "bun:sqlite";
import type { RuntimeToControlPlane } from "@aven/protocol/runtime-wire";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const MAX_ENTRIES = 20_000;

export type Source = { id: string; sequence: number };

export class RunOutbox {
  #db: Database;
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

  open(runId: string) {
    this.#next.set(runId, this.#next.get(runId) ?? 1);
    this.#attached.add(runId);
    this.#db.query("insert or ignore into outbox_runs (run_id) values (?)").run(runId);
  }

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

  cursor(runId: string, sourceId: string) {
    return (
      this.#db
        .query<{ last: number | null }, [string, string]>(
          "select max(source_sequence) as last from outbox where run_id = ? and source = ?",
        )
        .get(runId, sourceId)?.last ?? 0
    );
  }

  attached(runId: string) {
    return this.#attached.has(runId);
  }

  detachAll() {
    this.#attached.clear();
  }

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
  if (path !== ":memory:") chmodSync(path, 0o600);
  db.run("pragma journal_mode = wal");
  db.run("pragma synchronous = normal");
  return db;
}
