import type { DurableEvent } from "@anvia/durable";
import { expect, test } from "bun:test";

import { createDurableEventMapper } from "./durable-events";

const event = (type: string, data: unknown) => ({ type, data }) as unknown as DurableEvent;
const started = event("tool_started", {
  operationId: "op1",
  input: { toolCall: { toolCallId: "c1", toolName: "exec_command", input: { command: "ls" } } },
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

test("an image the agent showed reaches the client with its tool's end", () => {
  const { map } = createDurableEventMapper();
  const image = { name: "00000000-0000-4000-8000-000000000001.png", mediaType: "image/png" };
  map(
    event("tool_started", {
      operationId: "op2",
      input: { toolCall: { toolCallId: "c2", toolName: "show_image", input: { path: "a.png" } } },
    }),
  );
  const completed = map(
    event("tool_completed", {
      operationId: "op2",
      result: { output: { type: "json", value: { image, path: "a.png" } } },
    }),
  );
  expect(completed.events).toEqual([
    { type: "tool_end", id: "c2", status: "done", output: "Showed a.png", image },
  ]);
});
