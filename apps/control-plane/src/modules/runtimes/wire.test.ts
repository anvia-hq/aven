import { describe, expect, test } from "bun:test";

import type { RunEvent } from "@aven/protocol/events";

import { parseRuntimeFrame } from "./wire";

const frame = (event: unknown) => JSON.stringify({ type: "run.event", runId: "r1", seq: 1, event });

describe("run events from a runtime", () => {
  const turn = { inputTokens: 1, outputTokens: 2, cacheWriteTokens: 3, cacheReadTokens: 4 };

  test("a usage event is accepted, with or without the context", () => {
    const event = {
      type: "usage",
      turn,
      context: { usedTokens: 330, contextWindow: 1000 },
    } as const;
    expect(parseRuntimeFrame(frame(event))).toEqual({
      type: "run.event",
      runId: "r1",
      seq: 1,
      event,
    });
    const bare = { type: "usage", turn } as const;
    expect(parseRuntimeFrame(frame(bare))).toEqual({
      type: "run.event",
      runId: "r1",
      seq: 1,
      event: bare,
    });
  });

  test("a usage event with nonsense numbers is refused", () => {
    expect(
      parseRuntimeFrame(frame({ type: "context", usedTokens: -1, contextWindow: 1000 })),
    ).toBeNull();
    expect(
      parseRuntimeFrame(frame({ type: "context", usedTokens: 1, contextWindow: 0 })),
    ).toBeNull();
  });

  test("a subagent's activity is accepted, and a spawn_agent tool part keeps its subagents", () => {
    const tool = { id: "t1", name: "read_file", target: "a.ts", status: "running" } as const;
    const events: RunEvent[] = [
      { type: "subagent", index: 2, event: { type: "tool_start", tool } },
      { type: "subagent", index: 2, event: { type: "tool_end", id: "t1", status: "done" } },
      { type: "subagent", index: 2, event: { type: "end", status: "error", output: "no model" } },
      {
        type: "tool_start",
        tool: {
          id: "s1",
          name: "spawn_agent",
          target: "1 task",
          status: "running",
          subagents: [
            {
              index: 0,
              description: "Find auth",
              type: "explore",
              status: "running",
              tools: [tool],
            },
          ],
        },
      },
    ];
    for (const event of events)
      expect(parseRuntimeFrame(frame(event))).toEqual({
        type: "run.event",
        runId: "r1",
        seq: 1,
        event,
      });
  });

  test("a subagent event needs a whole number for its place in the call", () => {
    const end = { type: "end", status: "done" };
    expect(parseRuntimeFrame(frame({ type: "subagent", index: -1, event: end }))).toBeNull();
    expect(parseRuntimeFrame(frame({ type: "subagent", index: 0.5, event: end }))).toBeNull();
    expect(
      parseRuntimeFrame(frame({ type: "subagent", index: 0, event: { type: "text" } })),
    ).toBeNull();
  });

  test("events that are the control plane's to send are refused", () => {
    expect(parseRuntimeFrame(frame({ type: "done" }))).toBeNull();
  });
});

describe("calls from a runtime", () => {
  const call = (method: string) =>
    JSON.stringify({ type: "call", id: "c1", method, params: { runId: "r1" } });

  test("only the calls a runner makes today are accepted", () => {
    for (const method of ["memory.append", "repo.access", "skills.get"]) {
      expect(parseRuntimeFrame(call(method))).not.toBeNull();
    }
  });

  test("the transcript cannot be read, cleared or rewritten (wire version 22)", () => {
    for (const method of [
      "memory.load",
      "memory.clear",
      "memory.snapshot",
      "memory.replacePrefix",
    ]) {
      expect(parseRuntimeFrame(call(method))).toBeNull();
    }
  });
});
