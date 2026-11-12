import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import type { QuestionPrompt } from "@aven/protocol/types";

export type ParkedQuestion = {
  durableId: string;
  agentId: string;
  toolCallId: string;
  toolName: string;
  interactionId: string;
  questions: QuestionPrompt[];
};

export class CodexSessions {
  #db: Database;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.#db = new Database(path);
    this.#db.run(`create table if not exists codex_sessions (
      thread_id text primary key,
      session_id text not null,
      durable_id text not null
    )`);
    this.#db.run(`create table if not exists codex_parked (
      thread_id text primary key,
      durable_id text not null,
      agent_id text not null,
      tool_call_id text not null,
      tool_name text not null,
      interaction_id text not null,
      questions text not null
    )`);
  }

  save(threadId: string, sessionId: string, durableId: string) {
    this.#db
      .query(
        `insert into codex_sessions (thread_id, session_id, durable_id) values (?, ?, ?)
         on conflict (thread_id) do update set session_id = excluded.session_id, durable_id = excluded.durable_id`,
      )
      .run(threadId, sessionId, durableId);
  }

  session(threadId: string) {
    return this.#db
      .query<{ session_id: string; durable_id: string }, [string]>(
        "select session_id, durable_id from codex_sessions where thread_id = ?",
      )
      .get(threadId);
  }

  byDurable(durableId: string) {
    return this.#db
      .query<{ thread_id: string; session_id: string }, [string]>(
        "select thread_id, session_id from codex_sessions where durable_id = ?",
      )
      .get(durableId);
  }

  parkedThread(durableId: string) {
    return this.#db
      .query<{ thread_id: string }, [string]>(
        "select thread_id from codex_parked where durable_id = ?",
      )
      .get(durableId)?.thread_id;
  }

  park(threadId: string, parked: ParkedQuestion) {
    this.#db
      .query(
        `insert into codex_parked
           (thread_id, durable_id, agent_id, tool_call_id, tool_name, interaction_id, questions)
         values (?, ?, ?, ?, ?, ?, ?)
         on conflict (thread_id) do update set
           durable_id = excluded.durable_id,
           agent_id = excluded.agent_id,
           tool_call_id = excluded.tool_call_id,
           tool_name = excluded.tool_name,
           interaction_id = excluded.interaction_id,
           questions = excluded.questions`,
      )
      .run(
        threadId,
        parked.durableId,
        parked.agentId,
        parked.toolCallId,
        parked.toolName,
        parked.interactionId,
        JSON.stringify(parked.questions),
      );
  }

  parked(threadId: string): ParkedQuestion | undefined {
    const row = this.#db
      .query<
        {
          durable_id: string;
          agent_id: string;
          tool_call_id: string;
          tool_name: string;
          interaction_id: string;
          questions: string;
        },
        [string]
      >(
        "select durable_id, agent_id, tool_call_id, tool_name, interaction_id, questions from codex_parked where thread_id = ?",
      )
      .get(threadId);

    if (!row) return undefined;

    return {
      durableId: row.durable_id,
      agentId: row.agent_id,
      toolCallId: row.tool_call_id,
      toolName: row.tool_name,
      interactionId: row.interaction_id,
      questions: JSON.parse(row.questions) as QuestionPrompt[],
    };
  }

  clearPark(threadId: string) {
    this.#db.query("delete from codex_parked where thread_id = ?").run(threadId);
  }

  close() {
    this.#db.close();
  }
}
