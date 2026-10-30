import { Agent, createQuestionTool } from "@anvia/core";
import { scriptedModel, text, type ScriptStep } from "@aven/agents/testing/scripted-model";
import type { RunEvent } from "@aven/protocol/events";
import { afterEach, describe, expect, test } from "bun:test";

import { DurableRuns, type RunInput } from "./durable-runs";
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
