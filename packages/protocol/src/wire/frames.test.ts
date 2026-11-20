import { describe, expect, test } from "bun:test";

import type { ContextSegment, RunEvent } from "../types";
import { ALLOWED_RUN_EVENT_TYPES, parseRuntimeFrame } from "./frames";
import type { WireRunEvent } from "./frames";

const eventFrame = (event: unknown) =>
  JSON.stringify({ type: "run.event", runId: "r1", seq: 1, event });

describe("run events from a runtime", () => {
  const turn = { inputTokens: 1, outputTokens: 2, cacheWriteTokens: 3, cacheReadTokens: 4 };

  test("every event the wire accepts is a thread event", () => {
    const fits: WireRunEvent extends RunEvent ? true : never = true;
    expect(fits).toBe(true);
    expect(ALLOWED_RUN_EVENT_TYPES).toContain("text");
    expect(ALLOWED_RUN_EVENT_TYPES).toContain("limits");
  });

  test("a usage event is accepted, with or without the context", () => {
    const event = {
      type: "usage",
      turn,
      context: { usedTokens: 330, contextWindow: 1000 },
    } as const;
    expect(parseRuntimeFrame(eventFrame(event))).toEqual({
      type: "run.event",
      runId: "r1",
      seq: 1,
      event,
    });
    const bare = { type: "usage", turn } as const;
    expect(parseRuntimeFrame(eventFrame(bare))).toEqual({
      type: "run.event",
      runId: "r1",
      seq: 1,
      event: bare,
    });
  });

  test("a usage event keeps how the context is split, and refuses a segment it does not know", () => {
    const segments: ContextSegment[] = [
      { id: "instructions", tokens: 120 },
      { id: "tools", tokens: 80 },
      { id: "messages", tokens: 130 },
    ];
    const event = {
      type: "usage",
      turn,
      context: { usedTokens: 330, contextWindow: 1000, segments },
    } as const;
    expect(parseRuntimeFrame(eventFrame(event))).toEqual({
      type: "run.event",
      runId: "r1",
      seq: 1,
      event,
    });
    const unknown = { ...event, context: { usedTokens: 1, segments: [{ id: "x", tokens: 1 }] } };
    expect(parseRuntimeFrame(eventFrame(unknown))).toBeNull();
  });

  test("the model's reasoning is accepted, as the thread shows it (decision 0115)", () => {
    const event = { type: "reasoning", delta: "The bug is in parsing." } as const;
    expect(parseRuntimeFrame(eventFrame(event))).toEqual({
      type: "run.event",
      runId: "r1",
      seq: 1,
      event,
    });
    expect(parseRuntimeFrame(eventFrame({ type: "reasoning" }))).toBeNull();
    expect(parseRuntimeFrame(eventFrame({ type: "reasoning", delta: 7 }))).toBeNull();
  });

  test("text, steer_applied, tool_end, and limits events are validated", () => {
    expect(parseRuntimeFrame(eventFrame({ type: "text", delta: "hi" }))).not.toBeNull();
    expect(parseRuntimeFrame(eventFrame({ type: "steer_applied", id: "s1" }))).not.toBeNull();
    expect(parseRuntimeFrame(eventFrame({ type: "steer_applied", id: "" }))).toBeNull();
    expect(
      parseRuntimeFrame(eventFrame({ type: "tool_end", id: "t1", status: "done", output: "ok" })),
    ).not.toBeNull();
    expect(
      parseRuntimeFrame(
        eventFrame({
          type: "limits",
          limits: [{ window: "five_hour", status: "allowed", percent: 42 }],
        }),
      ),
    ).not.toBeNull();
    expect(
      parseRuntimeFrame(
        eventFrame({
          type: "limits",
          limits: [{ window: "five_hour", status: "allowed", percent: 101 }],
        }),
      ),
    ).toBeNull();
  });

  test("a usage event with nonsense numbers is refused", () => {
    const usage = (event: object) =>
      parseRuntimeFrame(eventFrame({ type: "usage", turn, ...event }));

    expect(usage({ context: { usedTokens: 1, contextWindow: 1000 } })).not.toBeNull();
    expect(usage({ context: { usedTokens: -1, contextWindow: 1000 } })).toBeNull();
    expect(usage({ context: { usedTokens: 1, contextWindow: 0 } })).toBeNull();
    expect(usage({ turn: { ...turn, inputTokens: -1 } })).toBeNull();
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
    for (const event of events) {
      expect(parseRuntimeFrame(eventFrame(event))).toEqual({
        type: "run.event",
        runId: "r1",
        seq: 1,
        event,
      });
    }
  });

  test("a subagent event needs a whole number for its place in the call", () => {
    const end = { type: "end", status: "done" };
    expect(parseRuntimeFrame(eventFrame({ type: "subagent", index: -1, event: end }))).toBeNull();
    expect(parseRuntimeFrame(eventFrame({ type: "subagent", index: 0.5, event: end }))).toBeNull();
    expect(
      parseRuntimeFrame(eventFrame({ type: "subagent", index: 0, event: { type: "text" } })),
    ).toBeNull();
  });

  test("events that are the control plane's to send are refused", () => {
    expect(parseRuntimeFrame(eventFrame({ type: "done" }))).toBeNull();
    expect(parseRuntimeFrame("not-json")).toBeNull();
  });
});

describe("calls and replies from a runtime", () => {
  const call = (method: string) =>
    JSON.stringify({ type: "call", id: "c1", method, params: { runId: "r1" } });

  test("only the calls a runner makes today are accepted", () => {
    for (const method of [
      "memory.append",
      "repo.access",
      "repo.folder",
      "skills.get",
      "mcp.report",
      "codex.auth",
      "bot.memory",
      "bot.create",
      "bot.delete",
      "bot.update",
      "bot.send",
      "bot.react",
      "bot.project",
      "bot.question",
      "bot.schedule",
      "bot.goal",
      "bot.skill",
      "bot.mcp",
      "bot.provider",
      "bot.thread",
      "bot.notes",
      "bot.cockpit",
      "bot.api",
      "memory.notes",
      "cockpit.read",
      "fork.start",
      "fork.status",
      "environment.save",
      "environment.read",
      "machine.call",
    ]) {
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

  test("a reply requires a boolean ok field", () => {
    expect(
      parseRuntimeFrame(JSON.stringify({ type: "reply", id: "c1", ok: true, result: { a: 1 } })),
    ).toEqual({ type: "reply", id: "c1", ok: true, result: { a: 1 } });
    expect(
      parseRuntimeFrame(
        JSON.stringify({ type: "reply", id: "c2", ok: false, error: "boom", code: "E_FAIL" }),
      ),
    ).toEqual({ type: "reply", id: "c2", ok: false, error: "boom", code: "E_FAIL" });

    expect(parseRuntimeFrame(JSON.stringify({ type: "reply", id: "c1" }))).toBeNull();
    expect(parseRuntimeFrame(JSON.stringify({ type: "reply", id: "c1", ok: "yes" }))).toBeNull();
    expect(parseRuntimeFrame(JSON.stringify({ type: "reply", id: "c1", ok: 1 }))).toBeNull();
  });
});

describe("hello, run.end, process.ended, terminal, port, and host.stats frames", () => {
  test("hello may say which release the runner is", () => {
    expect(
      parseRuntimeFrame(JSON.stringify({ type: "hello", version: 33, runs: [], build: "0.3.0" })),
    ).toEqual({ type: "hello", version: 33, runs: [], build: "0.3.0" });
    expect(parseRuntimeFrame(JSON.stringify({ type: "hello", version: 33 }))).toEqual({
      type: "hello",
      version: 33,
      runs: [],
    });
    expect(
      parseRuntimeFrame(JSON.stringify({ type: "hello", version: 33, build: "x".repeat(65) })),
    ).toBeNull();
    expect(parseRuntimeFrame(JSON.stringify({ type: "hello", version: 33, build: 3 }))).toBeNull();
  });

  test("run.end and process.ended validate ids, counts, and outcomes", () => {
    expect(
      parseRuntimeFrame(
        JSON.stringify({ type: "run.end", runId: "r1", seq: 2, outcome: "response" }),
      ),
    ).toEqual({ type: "run.end", runId: "r1", seq: 2, outcome: "response" });
    expect(
      parseRuntimeFrame(
        JSON.stringify({ type: "run.end", runId: "r1", seq: 0, outcome: "response" }),
      ),
    ).toBeNull();

    const ended = {
      type: "process.ended" as const,
      threadId: "11111111-2222-4333-8444-555555555555",
      processId: "p1",
      command: "bun test",
      status: "exited",
      exitCode: 0,
      ranSeconds: 1.5,
      stdout: "ok",
      stderr: "",
    };
    expect(parseRuntimeFrame(JSON.stringify(ended))).toEqual(ended);
    expect(parseRuntimeFrame(JSON.stringify({ ...ended, threadId: "not-a-uuid" }))).toBeNull();
  });

  test("host stats accepts valid readings and rejects out-of-range numbers", () => {
    const stats = {
      cores: 4,
      cpuPercent: 37,
      memoryUsedBytes: 6_000_000_000,
      memoryTotalBytes: 16_000_000_000,
      diskUsedBytes: 74_000_000_000,
      diskTotalBytes: 98_000_000_000,
      sandboxes: 2,
    };
    const makeFrame = (override: Record<string, unknown> = {}) =>
      JSON.stringify({ type: "host.stats", stats: { ...stats, ...override } });

    expect(parseRuntimeFrame(makeFrame())).toEqual({ type: "host.stats", stats });
    expect(parseRuntimeFrame(makeFrame({ cpuPercent: null }))).toMatchObject({
      stats: { cpuPercent: null },
    });
    expect(parseRuntimeFrame(makeFrame({ cpuPercent: 101 }))).toBeNull();
    expect(parseRuntimeFrame(makeFrame({ cpuPercent: -1 }))).toBeNull();
    expect(parseRuntimeFrame(makeFrame({ memoryTotalBytes: -5 }))).toBeNull();
    expect(parseRuntimeFrame(makeFrame({ cores: 0 }))).toBeNull();
    expect(parseRuntimeFrame(makeFrame({ sandboxes: 1.5 }))).toBeNull();
    expect(parseRuntimeFrame(makeFrame({ diskUsedBytes: "lots" }))).toBeNull();
    expect(parseRuntimeFrame(makeFrame({ memoryUsedBytes: 17_000_000_000 }))).toBeNull();
    expect(parseRuntimeFrame(makeFrame({ diskUsedBytes: 99_000_000_000 }))).toBeNull();
    expect(parseRuntimeFrame(JSON.stringify({ type: "host.stats" }))).toBeNull();
  });

  test("terminal and port frames require viewer ids and close reasons", () => {
    expect(parseRuntimeFrame(JSON.stringify({ type: "terminal.opened", viewerId: "v1" }))).toEqual({
      type: "terminal.opened",
      viewerId: "v1",
    });
    expect(
      parseRuntimeFrame(JSON.stringify({ type: "terminal.closed", viewerId: "v1", reason: "eof" })),
    ).toEqual({ type: "terminal.closed", viewerId: "v1", reason: "eof" });
    expect(parseRuntimeFrame(JSON.stringify({ type: "port.opened", viewerId: "v1" }))).toEqual({
      type: "port.opened",
      viewerId: "v1",
    });
    expect(
      parseRuntimeFrame(JSON.stringify({ type: "port.closed", viewerId: "v1", reason: "gone" })),
    ).toEqual({ type: "port.closed", viewerId: "v1", reason: "gone" });
    expect(parseRuntimeFrame(JSON.stringify({ type: "port.opened" }))).toBeNull();
    expect(parseRuntimeFrame(JSON.stringify({ type: "port.closed", viewerId: "v1" }))).toBeNull();
  });
});

describe("bot frames from a runtime", () => {
  const say = (replyId: unknown, text: unknown) =>
    JSON.stringify({ type: "bot.say", replyId, text });

  test("bot.say, bot.activity, and bot.end are validated", () => {
    expect(parseRuntimeFrame(say("r1", "hello"))).toEqual({
      type: "bot.say",
      replyId: "r1",
      text: "hello",
    });
    expect(
      parseRuntimeFrame(
        JSON.stringify({ type: "bot.say", replyId: "r1", text: "on it", quote: "m-3" }),
      ),
    ).toEqual({ type: "bot.say", replyId: "r1", text: "on it", quote: "m-3" });
    expect(
      parseRuntimeFrame(
        JSON.stringify({ type: "bot.say", replyId: "r1", text: "on it", quote: "x" }),
      ),
    ).toBeNull();
    expect(parseRuntimeFrame(say("r1", ""))).toBeNull();
    expect(parseRuntimeFrame(say("r1", "x".repeat(2001)))).toBeNull();
    expect(parseRuntimeFrame(say("", "hi"))).toBeNull();
    expect(parseRuntimeFrame(say("r1", 7))).toBeNull();

    expect(
      parseRuntimeFrame(
        JSON.stringify({ type: "bot.activity", replyId: "r1", label: " Searching " }),
      ),
    ).toEqual({ type: "bot.activity", replyId: "r1", label: "Searching" });
    expect(
      parseRuntimeFrame(JSON.stringify({ type: "bot.activity", replyId: "r1", label: null })),
    ).toEqual({ type: "bot.activity", replyId: "r1", label: null });
    expect(
      parseRuntimeFrame(JSON.stringify({ type: "bot.end", replyId: "r1", error: "no model" })),
    ).toMatchObject({ type: "bot.end", error: "no model" });
  });
});
