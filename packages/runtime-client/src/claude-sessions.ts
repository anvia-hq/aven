import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import type { QuestionPrompt } from "@aven/protocol/types";

export type ParkedQuestion = {
  threadId: string;
  agentId: string;
  runId: string;
  sessionId: string;
  toolCallId: string;
  toolName: string;
  questions: QuestionPrompt[];
};

type SessionRow = { thread_id: string; session_id: string; durable_id: string | null };

type ParkRow = {
  thread_id: string;
  agent_id: string;
  run_id: string;
  session_id: string;
  tool_call_id: string;
  tool_name: string;
  questions: string;
};

export class ClaudeSessions {
  #db: Database;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.#db = new Database(path);
    this.#db.run(
      "create table if not exists claude_sessions (thread_id text primary key, session_id text not null, durable_id text)",
    );
    const columns = this.#db
      .query<{ name: string }, []>("pragma table_info(claude_sessions)")
      .all();

    if (!columns.some((column) => column.name === "durable_id")) {
      this.#db.run("alter table claude_sessions add column durable_id text");
    }

    this.#db.run(
      "create table if not exists claude_parked (thread_id text primary key, agent_id text not null, run_id text not null, session_id text not null, tool_call_id text not null, tool_name text not null, questions text not null)",
    );
  }

  get(threadId: string) {
    return this.#db
      .query<{ session_id: string }, [string]>(
        "select session_id from claude_sessions where thread_id = ?",
      )
      .get(threadId)?.session_id;
  }

  byDurable(durableId: string) {
    const row = this.#db
      .query<SessionRow, [string]>(
        "select thread_id, session_id, durable_id from claude_sessions where durable_id = ?",
      )
      .get(durableId);
    return row
      ? { threadId: row.thread_id, sessionId: row.session_id, durableId: row.durable_id ?? "" }
      : undefined;
  }

  set(threadId: string, sessionId: string, durableId?: string) {
    const existing = durableId
      ? durableId
      : this.#db
          .query<{ durable_id: string | null }, [string]>(
            "select durable_id from claude_sessions where thread_id = ?",
          )
          .get(threadId)?.durable_id;
    this.#db
      .query(
        "insert or replace into claude_sessions (thread_id, session_id, durable_id) values (?, ?, ?)",
      )
      .run(threadId, sessionId, existing ?? null);
  }

  park(question: ParkedQuestion) {
    this.#db
      .query(
        "insert or replace into claude_parked (thread_id, agent_id, run_id, session_id, tool_call_id, tool_name, questions) values (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        question.threadId,
        question.agentId,
        question.runId,
        question.sessionId,
        question.toolCallId,
        question.toolName,
        JSON.stringify(question.questions),
      );
  }

  parked(threadId: string) {
    return this.#read(
      this.#db
        .query<ParkRow, [string]>("select * from claude_parked where thread_id = ?")
        .get(threadId),
    );
  }

  parkedAgent(agentId: string) {
    return this.#read(
      this.#db
        .query<ParkRow, [string]>("select * from claude_parked where agent_id = ?")
        .get(agentId),
    );
  }

  clearPark(threadId: string) {
    this.#db.query("delete from claude_parked where thread_id = ?").run(threadId);
  }

  #read(row: ParkRow | null) {
    if (!row) return undefined;

    let questions: QuestionPrompt[] = [];
    try {
      const parsed: unknown = JSON.parse(row.questions);

      if (Array.isArray(parsed)) questions = parsed as QuestionPrompt[];
    } catch {
      questions = [];
    }
    return {
      threadId: row.thread_id,
      agentId: row.agent_id,
      runId: row.run_id,
      sessionId: row.session_id,
      toolCallId: row.tool_call_id,
      toolName: row.tool_name,
      questions,
    };
  }

  close() {
    this.#db.close();
  }
}
