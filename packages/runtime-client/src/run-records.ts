import type { Database } from "bun:sqlite";
import type { KeptAttachment } from "@aven/agents/attachments";
import type { SkillListing } from "@aven/agents/skills";
import type { GoalRequest } from "@aven/agents/tools/define-goal";
import type { MessageMention } from "@aven/protocol/events";
import type { CockpitAccess } from "@aven/protocol/cockpit";
import type { RunMemory } from "@aven/protocol/memory";
import type { RunModel, RunSkill, RunThreadInfo } from "@aven/protocol/runtime-wire";

import type { GoalState } from "./durable-goals";

export type RunRecord = {
  runId: string;
  thread: RunThreadInfo;
  model?: RunModel;
  kind: "start" | "answer";
  prompt?: string;
  compact?: boolean;
  attachments?: KeptAttachment[];
  mentions?: MessageMention[];
  skills?: RunSkill[];
  skillListing?: SkillListing[];
  memory?: RunMemory;
  cockpit?: CockpitAccess;
  agentId: string;
  durableId?: string;
  turn: number;
  phase: "chat" | "goal" | "report";
  goal?: GoalRequest;
  goalState?: GoalState;
  reportId?: string;
  done?: boolean;
};

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
