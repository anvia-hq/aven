import { Agent, createQuestionTool } from "@anvia/core";
import { scriptedModel, text, type ScriptStep } from "@aven/agents/testing/scripted-model";
import type { RunEvent } from "@aven/protocol/events";
import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { hostname } from "node:os";

import { DurableRuns, type RunInput } from "./durable-runs";
import { goalSessionMarker } from "./goal-report";
import { journalPath } from "./testing/journal-path";

const question: ScriptStep = [
  {
    type: "tool-call",
    toolCallId: "q1",
    toolName: "ask_user",
    input: { questions: [{ id: "color", text: "Which color?" }] },
  },
];

const input = (id: string, ...steps: ScriptStep[]): RunInput => ({
  agent: new Agent({
    id,
    instructions: "x",
    tools: [createQuestionTool()],
    model: scriptedModel(steps),
  }),
});

const open: DurableRuns[] = [];
afterEach(async () => {
  for (const runs of open.splice(0)) await runs.close();
});
const opened = async (path: string) => {
  const runs = await DurableRuns.open(path);
  open.push(runs);
  return runs;
};
const closed = async (runs: DurableRuns, release?: () => void) => {
  const closing = runs.close();
  release?.();
  await closing;
  open.splice(open.indexOf(runs), 1);
};

describe("DurableRuns after the process restarts", () => {
  test("a run parked on a question is answered by a process that never saw it", async () => {
    const path = journalPath();
    const before = await opened(path);
    const asked = await before.start(
      "run-1",
      "thread-1",
      "paint it",
      input("run-1", question),
      () => {},
    );
    const end = await asked.done;
    expect(end.type).toBe("interaction");
    if (end.type !== "interaction") return;
    const { interaction } = end.continuation as {
      interaction: { id: string; toolCallId: string };
    };
    await closed(before);

    const after = await opened(path);
    const parked = await after.asked("thread-1");
    expect(parked?.agentId).toBe("run-1");

    const events: RunEvent[] = [];
    const answered = await after.answer(
      parked!,
      interaction,
      { type: "tool-question", answers: [{ questionId: "color", value: "red" }] },
      () => input("run-1", [text("Going with red")]),
      (event) => events.push(event),
    );
    expect(await answered.done).toMatchObject({ type: "response" });
    expect(events).toContainEqual({ type: "text", delta: "Going with red" });
    expect(await after.asked("thread-1")).toBeUndefined();
  });

  test("a run that was working is ended, so its thread can start another", async () => {
    const path = journalPath();
    const before = await opened(path);
    const hold = Promise.withResolvers<void>();
    const reached = Promise.withResolvers<void>();
    const working = await before.start(
      "run-1",
      "thread-1",
      "go",
      input("run-1", async () => {
        reached.resolve();
        await hold.promise;
        return [text("never")];
      }),
      () => {},
    );
    // The stopped process's own follow ends with the journal; nothing is listening for it.
    working.done.catch(() => undefined);
    await reached.promise;
    await closed(before, hold.resolve);

    const after = await opened(path);
    expect(await after.asked("thread-1")).toBeUndefined();
    const next = await after.start(
      "run-2",
      "thread-1",
      "again",
      input("run-2", [text("hi")]),
      () => {},
    );
    expect(await next.done).toMatchObject({ type: "response" });
  });
});

describe("DurableRuns after a reload in the same process", () => {
  test("a lease this process's earlier life left behind does not lock the journal", async () => {
    const path = journalPath();
    await (await DurableRuns.open(path)).close();
    const database = new Database(path);
    database
      .query("UPDATE anvia_durable_owner SET token = 'stale', pid = ?, host = ?")
      .run(process.pid, hostname());
    database.close();
    await opened(path);
  });

  test("a journal that is open in this process is not opened twice", async () => {
    const path = journalPath();
    await opened(path);
    await expect(DurableRuns.open(path)).rejects.toThrow("already open");
  });
});

describe("DurableRuns goals", () => {
  const request = {
    objective: "Make the tests pass",
    acceptanceCriteria: ["bun test passes"],
    verifyCommands: ["bun test"],
  };
  const results = (...exitCodes: number[]) => {
    let calls = 0;
    return async () => [
      {
        command: "bun test",
        exitCode: exitCodes[Math.min(calls++, exitCodes.length - 1)] ?? 0,
        output: "1 failed",
      },
    ];
  };

  test("works in sessions until the commands pass, reporting each session's events and messages", async () => {
    const runs = await opened(journalPath());
    const events: RunEvent[] = [];
    const sessions: string[][] = [];
    const goal = await runs.startGoal({
      runId: "run-1",
      request,
      input: input("goal-run-1", [text("first try")], [text("fixed it")]),
      verify: results(1, 0),
      onEvent: (event) => events.push(event),
      onSession: async (session, messages) =>
        void sessions.push([String(session), ...messages.map((message) => message.role)]),
    });

    expect(await goal.done).toMatchObject({ type: "complete", evidence: ["`bun test` passed"] });
    // A divider opens each session, then the session's own text.
    expect(events.filter((event) => event.type === "text")).toEqual([
      { type: "text", delta: goalSessionMarker(1) },
      { type: "text", delta: "first try" },
      { type: "text", delta: goalSessionMarker(2) },
      { type: "text", delta: "fixed it" },
    ]);
    // Each session's prompt, then its reply.
    expect(sessions).toEqual([
      ["1", "user", "assistant"],
      ["2", "user", "assistant"],
    ]);
  });

  test("a goal whose commands keep failing the same way stops short instead of looping", async () => {
    const runs = await opened(journalPath());
    const goal = await runs.startGoal({
      runId: "run-1",
      request,
      input: input("goal-run-1", [text("a")], [text("b")], [text("c")], [text("d")]),
      verify: results(1),
      onEvent: () => {},
      onSession: async () => {},
    });
    expect(await goal.done).toMatchObject({ type: "paused", reason: "no_progress" });
  });

  test("a goal's agent is released when it ends, so the id can be used again", async () => {
    const runs = await opened(journalPath());
    for (const id of ["a", "b"]) {
      const goal = await runs.startGoal({
        runId: `run-${id}`,
        request: { ...request, verifyCommands: [] },
        input: input("goal-run-1", [text(id)]),
        verify: async () => [],
        onEvent: () => {},
        onSession: async () => {},
      });
      expect((await goal.done).type).toBe("complete");
    }
  });
});
