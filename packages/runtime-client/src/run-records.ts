import type { Database } from "bun:sqlite";
import type { RunRecord } from "./types";

export const agentsOf = (record: RunRecord) => [
  record.agentId,
  `goal-${record.runId}`,
  `run-${record.runId}-report`,
];

export class RunRecords {
  #db: Database;

  constructor(db: Database) {
    this.#db = db;
    db.run("create table if not exists runs (run_id text primary key, record text not null)");
  }

  save(record: RunRecord) {
    this.#db
      .query("insert or replace into runs (run_id, record) values (?, ?)")
      .run(record.runId, JSON.stringify(record));
  }

  get(runId: string) {
    const row = this.#db
      .query<{ record: string }, [string]>("select record from runs where run_id = ?")
      .get(runId);
    return row ? (JSON.parse(row.record) as RunRecord) : undefined;
  }

  all() {
    return this.#db
      .query<{ record: string }, []>("select record from runs")
      .all()
      .map((row) => JSON.parse(row.record) as RunRecord);
  }

  delete(runId: string) {
    this.#db.query("delete from runs where run_id = ?").run(runId);
  }
}
