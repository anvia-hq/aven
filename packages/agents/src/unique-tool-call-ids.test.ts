import type {
  AssistantContentPart,
  CompletionModel,
  CompletionModelStreamEvent,
  CompletionResponse,
  Usage,
} from "@anvia/core";
import { describe, expect, test } from "bun:test";

import { withUniqueToolCallIds } from "./unique-tool-call-ids";

const calls = (ids: string[]): AssistantContentPart[] =>
  ids.map((toolCallId) => ({
    type: "tool-call",
    toolCallId,
    callId: `call_${toolCallId}`,
    toolName: "exec_command",
    input: {},
  }));

const response = (ids: string[]) =>
  ({ choice: calls(ids), usage: {} as Usage, rawResponse: {} }) as CompletionResponse;

// What Anvia's chat completions adapter yields for a reply: positional ids on the deltas and in the
// final response, whichever reply it is.
function fakeModel(ids: string[]) {
  const events: CompletionModelStreamEvent[] = [
    ...ids.map((id) => ({ type: "tool_call_delta" as const, id, name: "exec_command" })),
    { type: "final", response: response(ids) },
  ];
  return {
    label: "fake",
    completion: async () => response(ids),
    async *streamCompletion() {
      yield* events;
    },
  } as unknown as CompletionModel & { streamCompletion(): AsyncIterable<unknown> };
}

async function collect(model: ReturnType<typeof fakeModel>) {
  const out: CompletionModelStreamEvent[] = [];
  for await (const event of model.streamCompletion() as AsyncIterable<CompletionModelStreamEvent>)
    out.push(event);
  return out;
}

const idsOf = (events: CompletionModelStreamEvent[]) => ({
  deltas: events.flatMap((event) => (event.type === "tool_call_delta" ? [event.id] : [])),
  final: events.flatMap((event) =>
    event.type === "final"
      ? event.response.choice.flatMap((part) =>
          part.type === "tool-call" ? [part.toolCallId] : [],
        )
      : [],
  ),
});

describe("withUniqueToolCallIds", () => {
  test("gives each reply's positional ids a suffix of their own, the same in its deltas and its final response", async () => {
    const model = withUniqueToolCallIds(fakeModel(["tool_0", "tool_1"]));

    const first = idsOf(await collect(model));
    const second = idsOf(await collect(model));

    expect(first.deltas).toEqual(first.final);
    expect(first.deltas[0]).toMatch(/^tool_0-[0-9a-f]{8}$/);
    expect(first.deltas[1]).toMatch(/^tool_1-[0-9a-f]{8}$/);
    expect(first.deltas[0]?.split("-")[1]).toBe(first.deltas[1]?.split("-")[1]);
    expect(second.deltas[0]).not.toBe(first.deltas[0]);
  });

  test("keeps the provider's own id for requests, and leaves ids a provider issued alone", async () => {
    const model = withUniqueToolCallIds(fakeModel(["tool_0", "toolu_01abc"]));

    const events = await collect(model);
    const final = events.find((event) => event.type === "final");
    const parts = final?.type === "final" ? final.response.choice : [];

    expect(parts[0]).toMatchObject({ callId: "call_tool_0" });
    expect(idsOf(events).final[1]).toBe("toolu_01abc");
  });

  test("renames the calls of a response that was not streamed", async () => {
    const model = withUniqueToolCallIds(fakeModel(["tool_0"]));

    const result = await model.completion({} as never);
    const [part] = result.choice;

    expect(part?.type === "tool-call" ? part.toolCallId : "").toMatch(/^tool_0-[0-9a-f]{8}$/);
  });

  test("passes everything else through to the model", () => {
    const model = withUniqueToolCallIds(fakeModel([]));

    expect((model as unknown as { label: string }).label).toBe("fake");
  });
});
