import { describe, expect, test } from "bun:test";

import {
  BOT_AVATAR_MAX,
  BOT_DESCRIPTION_MAX,
  BOT_INSTRUCTION_MAX,
  BOT_NAME_MAX,
} from "@aven/protocol/bots";
import type { RunEvent } from "@aven/protocol/events";

import {
  parseBotCreateParams,
  parseBotMemoryParams,
  parseBotUpdateParams,
  parseRuntimeFrame,
} from "./wire";

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
    for (const method of [
      "memory.append",
      "repo.access",
      "skills.get",
      "bot.memory",
      "bot.create",
      "bot.update",
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
});

describe("a bot's reply from a runtime", () => {
  const say = (replyId: unknown, text: unknown) =>
    JSON.stringify({ type: "bot.say", replyId, text });

  test("what the bot says and the end of its reply are accepted", () => {
    expect(parseRuntimeFrame(say("r1", "hello"))).toEqual({
      type: "bot.say",
      replyId: "r1",
      text: "hello",
    });
    expect(
      parseRuntimeFrame(JSON.stringify({ type: "bot.end", replyId: "r1", error: "no model" })),
    ).toMatchObject({ type: "bot.end", error: "no model" });
  });

  test("a message is something the bot could have sent: not empty, and no longer than the tool allows", () => {
    expect(parseRuntimeFrame(say("r1", ""))).toBeNull();
    expect(parseRuntimeFrame(say("r1", "x".repeat(2001)))).toBeNull();
    expect(parseRuntimeFrame(say("", "hi"))).toBeNull();
    expect(parseRuntimeFrame(say("r1", 7))).toBeNull();
  });

  test("a runner can read and add to a bot's conversation and summarize it, but not clear it", () => {
    const base = { replyId: "r1" };
    expect(parseBotMemoryParams({ ...base, op: "load" })).toMatchObject({ op: "load" });
    expect(
      parseBotMemoryParams({ ...base, op: "append", runId: "x", turn: 1, messages: [{}] }),
    ).toMatchObject({ op: "append" });
    expect(parseBotMemoryParams({ ...base, op: "snapshot" })).toMatchObject({ op: "snapshot" });
    expect(
      parseBotMemoryParams({
        ...base,
        op: "replacePrefix",
        runId: "x",
        revision: "1",
        messageCount: 2,
        replacement: {},
      }),
    ).toMatchObject({ op: "replacePrefix" });

    expect(() => parseBotMemoryParams({ ...base, op: "clear" })).toThrow();
    expect(() => parseBotMemoryParams({ op: "load" })).toThrow();
    expect(() =>
      parseBotMemoryParams({ ...base, op: "append", runId: "x", turn: -1, messages: [] }),
    ).toThrow();
  });

  test("a bot a runner asks for has a name and an instruction within the limits of settings", () => {
    const made = { replyId: "r1", name: " Scout ", instruction: " You research. ", avatar: "🔭" };
    expect(parseBotCreateParams(made)).toEqual({
      replyId: "r1",
      name: "Scout",
      instruction: "You research.",
      avatar: "🔭",
    });
    expect(parseBotCreateParams({ ...made, avatar: undefined }).avatar).toBeUndefined();

    for (const bad of [
      { ...made, name: "" },
      { ...made, name: "x".repeat(BOT_NAME_MAX + 1) },
      { ...made, instruction: " " },
      { ...made, instruction: "x".repeat(BOT_INSTRUCTION_MAX + 1) },
      { ...made, avatar: "x".repeat(BOT_AVATAR_MAX + 1) },
      { ...made, replyId: "" },
    ]) {
      expect(() => parseBotCreateParams(bad)).toThrow();
    }
  });
});

describe("a bot changing itself", () => {
  test("some of its name, description and instruction, within the limits of settings", () => {
    expect(parseBotUpdateParams({ replyId: "r1", name: " Scout " })).toMatchObject({
      name: "Scout",
    });
    expect(
      parseBotUpdateParams({ replyId: "r1", description: " Looks things up. " }),
    ).toMatchObject({ description: "Looks things up." });
    // Clearing a description or an instruction is a change, as it is in settings.
    expect(parseBotUpdateParams({ replyId: "r1", description: "" }).description).toBe("");
    expect(parseBotUpdateParams({ replyId: "r1", instruction: "" }).instruction).toBe("");
  });

  test("never nothing, and never more than settings allows", () => {
    for (const bad of [
      { replyId: "r1" },
      { replyId: "", name: "Scout" },
      { replyId: "r1", name: " " },
      { replyId: "r1", name: "x".repeat(BOT_NAME_MAX + 1) },
      { replyId: "r1", description: "x".repeat(BOT_DESCRIPTION_MAX + 1) },
      { replyId: "r1", instruction: "x".repeat(BOT_INSTRUCTION_MAX + 1) },
    ]) {
      expect(() => parseBotUpdateParams(bad)).toThrow();
    }
  });
});
