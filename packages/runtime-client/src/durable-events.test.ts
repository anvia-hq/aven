import type { DurableEvent } from "@anvia/durable";
import { expect, test } from "bun:test";

import { createDurableEventMapper } from "./durable-events";

const event = (type: string, data: unknown) => ({ type, data }) as unknown as DurableEvent;
const started = event("tool_started", {
  operationId: "op1",
  input: { toolCall: { toolCallId: "c1", toolName: "exec_command", input: { command: "ls" } } },
});

test("the model's reasoning reaches the client; other deltas stay private", () => {
  const { map } = createDurableEventMapper();
  expect(
    map(event("model_delta", { event: { type: "reasoning_delta", turn: 1, delta: "Hmm." } }))
      .events,
  ).toEqual([{ type: "reasoning", delta: "Hmm." }]);
  expect(
    map(event("model_delta", { event: { type: "tool_call_delta", turn: 1, id: "t1" } })).events,
  ).toEqual([]);
});

test("a tool is announced when it starts, for models whose stream has no finished call", () => {
  const { map } = createDurableEventMapper();
  expect(map(started).events).toEqual([
    { type: "tool_start", tool: expect.objectContaining({ id: "c1", name: "exec_command" }) },
  ]);
  expect(
    map(
      event("tool_completed", {
        operationId: "op1",
        result: { output: { type: "text", value: "x" } },
      }),
    ).events,
  ).toEqual([{ type: "tool_end", id: "c1", status: "done", output: "x" }]);
});

test("a tool the stream already announced is not announced again", () => {
  const { map } = createDurableEventMapper();
  const call = { toolCallId: "c1", toolName: "exec_command", input: { command: "ls" } };
  const streamed = map(event("model_delta", { event: { type: "tool_call", toolCall: call } }));
  expect(streamed.events).toHaveLength(1);
  expect(map(started).events).toEqual([]);
});

const question = {
  toolCallId: "tool_0-364895b4",
  toolName: "ask_user",
  input: {
    questions: [
      {
        id: "task_type",
        text: "What do you want to do?",
        choices: [{ label: "Explore", value: "explore" }],
      },
    ],
  },
};
const turnEnd = (choice: unknown[]) =>
  event("model_completed", {
    result: { choice, usage: { inputTokens: 100, outputTokens: 10, totalTokens: 110 } },
  });

test("a question the stream never announced is announced when the turn ends, before its usage", () => {
  const { map } = createDurableEventMapper();
  map(event("model_delta", { event: { type: "text_delta", turn: 1, delta: "What now?" } }));
  map(event("model_delta", { event: { type: "tool_call_delta", turn: 1, id: "tool_0-364895b4" } }));

  const ended = map(
    turnEnd([
      { type: "text", text: "What now?" },
      { type: "tool-call", ...question },
    ]),
  );

  expect(ended.events.map((announced) => announced.type)).toEqual(["tool_start", "usage"]);
  expect(ended.events[0]).toEqual({
    type: "tool_start",
    tool: expect.objectContaining({
      id: "tool_0-364895b4",
      name: "ask_user",
      status: "running",
      questions: [expect.objectContaining({ id: "task_type" })],
    }),
  });
});

test("a model whose window is unknown still reports what is in its context", () => {
  const unknown = createDurableEventMapper().map(turnEnd([])).events;
  expect(unknown).toEqual([
    {
      type: "usage",
      turn: expect.objectContaining({ inputTokens: 100 }),
      context: { usedTokens: 100 },
    },
  ]);
  const known = createDurableEventMapper({ contextWindow: 1000 }).map(turnEnd([])).events;
  expect(known[0]).toMatchObject({ context: { usedTokens: 100, contextWindow: 1000 } });
});

test("a compaction of a model with no known window reports no context, as its call is not the thread's", () => {
  const { map } = createDurableEventMapper({ compacting: true });
  expect(map(turnEnd([])).events).toEqual([
    { type: "usage", turn: expect.objectContaining({ inputTokens: 100 }), context: undefined },
  ]);
});

test("a call is announced once, whichever of the stream, the finished turn and its start comes first", () => {
  const stream = createDurableEventMapper();
  stream.map(event("model_delta", { event: { type: "tool_call", toolCall: question } }));
  expect(
    stream.map(turnEnd([{ type: "tool-call", ...question }])).events.map((e) => e.type),
  ).toEqual(["usage"]);

  const turn = createDurableEventMapper();
  const call = {
    type: "tool-call",
    toolCallId: "c1",
    toolName: "exec_command",
    input: { command: "ls" },
  };
  expect(turn.map(turnEnd([call])).events.map((e) => e.type)).toEqual(["tool_start", "usage"]);
  expect(turn.map(started).events).toEqual([]);
  expect(
    turn.map(
      event("tool_completed", {
        operationId: "op1",
        result: { output: { type: "text", value: "x" } },
      }),
    ).events,
  ).toEqual([{ type: "tool_end", id: "c1", status: "done", output: "x" }]);
});

test("several calls of a turn are announced in the order the model made them", () => {
  const { map } = createDurableEventMapper();
  const call = (id: string) => ({
    type: "tool-call",
    toolCallId: id,
    toolName: "read_file",
    input: { path: id },
  });

  const ended = map(turnEnd([call("a"), { type: "text", text: "between" }, call("b")]));

  expect(ended.events.map((e) => (e.type === "tool_start" ? e.tool.id : e.type))).toEqual([
    "a",
    "b",
    "usage",
  ]);
});

test("what the agent showed reaches the client with its tool's end", () => {
  const { map } = createDurableEventMapper();
  const artifacts = [
    { name: "00000000-0000-4000-8000-000000000001.png", mediaType: "image/png" },
    { name: "00000000-0000-4000-8000-000000000002.mp4", mediaType: "video/mp4", caption: "Run" },
  ];
  map(
    event("tool_started", {
      operationId: "op2",
      input: {
        toolCall: {
          toolCallId: "c2",
          toolName: "show_artifact",
          input: { items: [{ path: "a.png" }, { path: "b.mp4" }] },
        },
      },
    }),
  );
  const completed = map(
    event("tool_completed", {
      operationId: "op2",
      result: {
        output: { type: "json", value: { artifacts, paths: ["a.png", "b.mp4"], failed: [] } },
      },
    }),
  );
  expect(completed.events).toEqual([
    { type: "tool_end", id: "c2", status: "done", output: "Showed 2", artifacts },
  ]);
});
