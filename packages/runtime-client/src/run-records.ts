import type { Database } from "bun:sqlite";
import type { GoalRequest } from "@aven/agents/tools/define-goal";
import type { RunModel, RunThreadInfo } from "@aven/protocol/runtime-wire";

// What a runner needs to take a run up again after it restarts: who asked for what, and how far
// the run had got. Everything else is in the journal (decision 0024).
export type RunRecord = {
  runId: string;
  thread: RunThreadInfo;
  /** The model the control plane granted. Its token works while the control plane holds the run. */
  model?: RunModel;
  /** "start" runs a prompt; "answer" delivers the answers to a question the thread parked. */
  kind: "start" | "answer";
  prompt?: string;
  /** The agent the run's first part uses, and the run it has in the journal once submitted. */
  agentId: string;
  durableId?: string;
  /** The messages of the run filed with the control plane so far. */
  turn: number;
  /** A goal the agent handed over, to start when its turn ends. */
  goal?: GoalRequest;
  /** Set once `run.end` is in the outbox: nothing is left to do but wait for it to be acknowledged. */
  done?: boolean;
};

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
