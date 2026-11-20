import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";

import { BackendSessions } from "./sessions";
import { journalPath } from "./testing/journal-path";

describe("BackendSessions", () => {
  test("stores and retrieves sessions by thread and by durable id", () => {
    const path = `${journalPath()}.claude`;
    const sessions = new BackendSessions(path, "claude");
    try {
      expect(sessions.get("thread-1")).toBeUndefined();
      expect(sessions.byDurable("claude-run-1")).toBeUndefined();

      sessions.set("thread-1", "sess-1", "claude-run-1");
      expect(sessions.get("thread-1")).toBe("sess-1");
      expect(sessions.byDurable("claude-run-1")).toEqual({
        threadId: "thread-1",
        sessionId: "sess-1",
        durableId: "claude-run-1",
      });

      sessions.set("thread-1", "sess-2");
      expect(sessions.get("thread-1")).toBe("sess-2");
      expect(sessions.byDurable("claude-run-1")?.sessionId).toBe("sess-2");
    } finally {
      sessions.close();
    }
  });

  test("parks, looks up by thread or agent, and clears parked questions", () => {
    const path = `${journalPath()}.codex`;
    const sessions = new BackendSessions(path, "codex");
    try {
      const parked = {
        threadId: "thread-a",
        agentId: "run-1",
        runId: "1",
        sessionId: "sess-a",
        toolCallId: "q-1",
        toolName: "ask_user",
        questions: [{ id: "color", text: "Which color?" }],
      };
      sessions.park(parked);
      expect(sessions.parked("thread-a")).toEqual(parked);
      expect(sessions.parkedAgent("run-1")).toEqual(parked);

      sessions.clearPark("thread-a");
      expect(sessions.parked("thread-a")).toBeUndefined();
      expect(sessions.parkedAgent("run-1")).toBeUndefined();
    } finally {
      sessions.close();
    }
  });

  test("recovers gracefully when stored parked questions JSON is corrupt", () => {
    const path = `${journalPath()}.claude`;
    const sessions = new BackendSessions(path, "claude");
    try {
      const raw = new Database(path);
      try {
        raw
          .query(
            "insert into claude_parked (thread_id, agent_id, run_id, session_id, tool_call_id, tool_name, questions) values (?, ?, ?, ?, ?, ?, ?)",
          )
          .run("thread-bad", "agent-bad", "run-bad", "sess-bad", "tc-1", "ask_user", "{not-json");
      } finally {
        raw.close();
      }
      expect(sessions.parked("thread-bad")).toEqual({
        threadId: "thread-bad",
        agentId: "agent-bad",
        runId: "run-bad",
        sessionId: "sess-bad",
        toolCallId: "tc-1",
        toolName: "ask_user",
        questions: [],
      });
    } finally {
      sessions.close();
    }
  });
});
