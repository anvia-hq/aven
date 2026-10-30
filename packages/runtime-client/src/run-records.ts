import type { Database } from "bun:sqlite";
import type { GoalRequest } from "@aven/agents/tools/define-goal";
import type { RunModel, RunThreadInfo } from "@aven/protocol/runtime-wire";

import type { GoalState } from "./durable-runs";

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
  /** Where the run is: the agent's turn, the goal it handed over, or the report on that goal. */
  phase: "chat" | "goal" | "report";
  /** A goal the agent handed over, to start when its turn ends, and how far it has got. */
  goal?: GoalRequest;
  goalState?: GoalState;
  /** The report turn's run in the journal, once started. */
  reportId?: string;
  /** Set once `run.end` is in the outbox: nothing is left to do but wait for it to be acknowledged. */
  done?: boolean;
};

// Every agent a run uses in the journal, so a restart knows which of the journal's runs are its own.
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
