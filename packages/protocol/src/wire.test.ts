import { describe, expect, test } from "bun:test";

import { BOT_DESCRIPTION_MAX, BOT_INSTRUCTION_MAX, BOT_MESSAGE_MAX, BOT_NAME_MAX } from "./bots";

import {
  parseBotCreateParams,
  parseBotMemoryParams,
  parseBotGoalParams,
  parseBotReactParams,
  parseBotScheduleParams,
  parseBotSendParams,
  parseBotThreadParams,
  parseBotUpdateParams,
  parseMachineRelayParams,
  parseRuntimeFrame,
} from "./wire";
import type { RunEvent } from "./types";

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

  test("the model's reasoning is accepted, as the thread shows it (decision 0115)", () => {
    const event = { type: "reasoning", delta: "The bug is in parsing." } as const;
    expect(parseRuntimeFrame(frame(event))).toEqual({
      type: "run.event",
      runId: "r1",
      seq: 1,
      event,
    });
    expect(parseRuntimeFrame(frame({ type: "reasoning" }))).toBeNull();
    expect(parseRuntimeFrame(frame({ type: "reasoning", delta: 7 }))).toBeNull();
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
      "bot.send",
      "bot.question",
      "bot.schedule",
      "bot.goal",
    ]) {
      expect(parseRuntimeFrame(call(method))).not.toBeNull();
    }
  });

  test("a machine call names a run or a bot reply, and nothing else", () => {
    expect(parseMachineRelayParams({ runId: "r1", threadId: "other", op: "workspace" })).toEqual({
      runId: "r1",
      op: "workspace",
    });
    expect(parseMachineRelayParams({ runId: "r1", op: "exec", args: { command: "pwd" } })).toEqual({
      runId: "r1",
      op: "exec",
      args: { command: "pwd" },
    });
    expect(parseMachineRelayParams({ replyId: "reply-1", op: "paths" })).toEqual({
      replyId: "reply-1",
      op: "paths",
    });
    expect(() => parseMachineRelayParams({ op: "exec" })).toThrow("Invalid parameters");
    expect(() => parseMachineRelayParams({ replyId: "reply-1", op: "rm" })).toThrow(
      "Invalid parameters",
    );
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

describe("hello", () => {
  test("may say which release the runner is", () => {
    expect(
      parseRuntimeFrame(JSON.stringify({ type: "hello", version: 33, runs: [], build: "0.3.0" })),
    ).toEqual({ type: "hello", version: 33, runs: [], build: "0.3.0" });
    expect(parseRuntimeFrame(JSON.stringify({ type: "hello", version: 33 }))).toEqual({
      type: "hello",
      version: 33,
      runs: [],
    });
  });

  test("is refused with a build that is not a short string", () => {
    expect(
      parseRuntimeFrame(JSON.stringify({ type: "hello", version: 33, build: "x".repeat(65) })),
    ).toBeNull();
    expect(parseRuntimeFrame(JSON.stringify({ type: "hello", version: 33, build: 3 }))).toBeNull();
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

  test("a message can name the one it answers, and a bot can put one emoji on a message of its chat (decision 0258)", () => {
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
    expect(
      parseRuntimeFrame(
        JSON.stringify({
          type: "call",
          id: "c1",
          method: "bot.react",
          params: { replyId: "r1", messageId: "m-3", emoji: "👍" },
        }),
      ),
    ).toMatchObject({ type: "call", method: "bot.react" });
    expect(
      parseRuntimeFrame(
        JSON.stringify({
          type: "call",
          id: "c2",
          method: "bot.react",
          params: { replyId: "r1", messageId: "m-3", emoji: "great!" },
        }),
      ),
    ).toMatchObject({ type: "call", method: "bot.react" });
    expect(() =>
      parseBotReactParams({ replyId: "r1", messageId: "m-3", emoji: "great!" }),
    ).toThrow();
    expect(parseBotReactParams({ replyId: "r1", messageId: "m-3", emoji: "🎉" })).toEqual({
      replyId: "r1",
      messageId: "m-3",
      emoji: "🎉",
    });
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
    const made = { replyId: "r1", name: " Scout ", instruction: " You research. " };
    expect(parseBotCreateParams(made)).toEqual({
      replyId: "r1",
      name: "Scout",
      instruction: "You research.",
    });

    for (const bad of [
      { ...made, name: "" },
      { ...made, name: "x".repeat(BOT_NAME_MAX + 1) },
      { ...made, instruction: " " },
      { ...made, instruction: "x".repeat(BOT_INSTRUCTION_MAX + 1) },
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

describe("a bot writing to another bot", () => {
  test("names the other bot by its handle and says something, within what a message may hold", () => {
    expect(parseBotSendParams({ replyId: "r1", to: "data-analyst", text: " do A " })).toEqual({
      replyId: "r1",
      to: "data-analyst",
      text: "do A",
    });
    for (const bad of [
      { replyId: "r1", to: "Scout", text: "hi" },
      { replyId: "r1", to: "data analyst", text: "hi" },
      { replyId: "r1", to: "-scout", text: "hi" },
      { replyId: "r1", to: "scout", text: " " },
      { replyId: "r1", to: "scout", text: "x".repeat(BOT_MESSAGE_MAX + 1) },
      { replyId: "", to: "scout", text: "hi" },
    ]) {
      expect(() => parseBotSendParams(bad)).toThrow();
    }
  });
});

describe("a bot's goal", () => {
  test("each operation is shaped, and a goal has an objective and at most eight checks", () => {
    expect(parseBotGoalParams({ replyId: "r1", op: "get" })).toEqual({ replyId: "r1", op: "get" });
    expect(
      parseBotGoalParams({
        replyId: "r1",
        op: "start",
        objective: " Port it ",
        checks: [" bun test "],
        maxRounds: 5,
      }),
    ).toEqual({
      replyId: "r1",
      op: "start",
      objective: "Port it",
      checks: ["bun test"],
      maxRounds: 5,
    });
    expect(
      parseBotGoalParams({ replyId: "r1", op: "update", action: "blocked", reason: " no key " }),
    ).toEqual({ replyId: "r1", op: "update", action: "blocked", reason: "no key" });
  });

  test("what is empty, too many, too long or not an action is refused", () => {
    const start = { replyId: "r1", op: "start", objective: "o", checks: [] };
    for (const bad of [
      { ...start, objective: " " },
      { ...start, objective: "x".repeat(20_001) },
      { ...start, checks: Array.from({ length: 9 }, () => "true") },
      { ...start, checks: [" "] },
      { ...start, checks: ["x".repeat(4_001)] },
      { ...start, maxRounds: 0 },
      { ...start, maxRounds: 101 },
      { ...start, maxRounds: 1.5 },
      { replyId: "r1", op: "update", action: "finish" },
      { replyId: "r1", op: "update", action: "blocked", reason: "x".repeat(2_001) },
      { replyId: "r1", op: "done" },
    ]) {
      expect(() => parseBotGoalParams(bad)).toThrow();
    }
  });
});

describe("a bot's schedules", () => {
  const id = "11111111-2222-4333-8444-555555555555";

  test("each operation is shaped, and a made one has a name, a cron and a task", () => {
    expect(parseBotScheduleParams({ replyId: "r1", op: "list" })).toEqual({
      replyId: "r1",
      op: "list",
    });
    expect(
      parseBotScheduleParams({
        replyId: "r1",
        op: "create",
        name: " n ",
        cron: "0 7 * * *",
        prompt: "p",
        bot: "scout",
      }),
    ).toEqual({
      replyId: "r1",
      op: "create",
      name: "n",
      cron: "0 7 * * *",
      prompt: "p",
      bot: "scout",
    });
    expect(parseBotScheduleParams({ replyId: "r1", op: "update", id, enabled: false })).toEqual({
      replyId: "r1",
      op: "update",
      id,
      enabled: false,
    });
    expect(parseBotScheduleParams({ replyId: "r1", op: "delete", id })).toEqual({
      replyId: "r1",
      op: "delete",
      id,
    });
  });

  test("what is missing, empty, too long or not an id is refused, and so is an operation there is not", () => {
    const create = { replyId: "r1", op: "create", name: "n", cron: "0 7 * * *", prompt: "p" };
    for (const bad of [
      { replyId: "r1", op: "run" },
      { ...create, name: " " },
      { ...create, cron: "" },
      { ...create, prompt: " " },
      { ...create, prompt: "x".repeat(20_001) },
      { replyId: "r1", op: "update", id: "x" },
      { replyId: "r1", op: "delete", id: "x" },
      { replyId: "", op: "list" },
    ]) {
      expect(() => parseBotScheduleParams(bad)).toThrow();
    }
  });
});

describe("a bot's threads", () => {
  const id = "11111111-2222-4333-8444-555555555555";
  const projectId = "66666666-7777-4888-8999-000000000000";
  const base = { replyId: "r1" };

  test("each operation is shaped, and a thread is started in a project with a prompt", () => {
    expect(parseBotThreadParams({ ...base, op: "projects" })).toEqual({ ...base, op: "projects" });
    expect(parseBotThreadParams({ ...base, op: "list", projectId, archived: true })).toEqual({
      ...base,
      op: "list",
      projectId,
      archived: true,
    });
    expect(parseBotThreadParams({ ...base, op: "get", id })).toEqual({ ...base, op: "get", id });
    expect(
      parseBotThreadParams({
        ...base,
        op: "start",
        projectId,
        prompt: "  Fix it ",
        title: "Fix",
        modelId: "gpt-5",
      }),
    ).toEqual({
      ...base,
      op: "start",
      projectId,
      prompt: "Fix it",
      title: "Fix",
      modelId: "gpt-5",
    });
    expect(parseBotThreadParams({ ...base, op: "continue", id, prompt: "More" })).toEqual({
      ...base,
      op: "continue",
      id,
      prompt: "More",
    });
    expect(parseBotThreadParams({ ...base, op: "archive", id })).toEqual({
      ...base,
      op: "archive",
      id,
    });
  });

  test("what is missing, empty, too long or not an id is refused, and so is an operation there is not", () => {
    for (const bad of [
      { ...base, op: "start", prompt: "Fix it" },
      { ...base, op: "start", projectId: "main", prompt: "Fix it" },
      { ...base, op: "start", projectId, prompt: "   " },
      { ...base, op: "start", projectId, prompt: "x".repeat(20_001) },
      { ...base, op: "continue", id: "latest", prompt: "More" },
      { ...base, op: "get" },
      { ...base, op: "archive", id, archived: "yes" },
      { ...base, op: "delete", id },
      { op: "projects" },
    ]) {
      expect(() => parseBotThreadParams(bad)).toThrow("Invalid parameters");
    }
  });
});

describe("host stats", () => {
  const stats = {
    cores: 4,
    cpuPercent: 37,
    memoryUsedBytes: 6_000_000_000,
    memoryTotalBytes: 16_000_000_000,
    diskUsedBytes: 74_000_000_000,
    diskTotalBytes: 98_000_000_000,
    sandboxes: 2,
  };
  const frame = (override: Record<string, unknown> = {}) =>
    JSON.stringify({ type: "host.stats", stats: { ...stats, ...override } });

  test("is how loaded the machine is, and the processors may be unknown", () => {
    expect(parseRuntimeFrame(frame())).toEqual({ type: "host.stats", stats });
    expect(parseRuntimeFrame(frame({ cpuPercent: null }))).toMatchObject({
      stats: { cpuPercent: null },
    });
  });

  test("is refused when a number is not one a machine can have", () => {
    expect(parseRuntimeFrame(frame({ cpuPercent: 101 }))).toBeNull();
    expect(parseRuntimeFrame(frame({ cpuPercent: -1 }))).toBeNull();
    expect(parseRuntimeFrame(frame({ memoryTotalBytes: -5 }))).toBeNull();
    expect(parseRuntimeFrame(frame({ cores: 0 }))).toBeNull();
    expect(parseRuntimeFrame(frame({ sandboxes: 1.5 }))).toBeNull();
    expect(parseRuntimeFrame(frame({ diskUsedBytes: "lots" }))).toBeNull();
    expect(parseRuntimeFrame(frame({ memoryUsedBytes: 17_000_000_000 }))).toBeNull();
    expect(parseRuntimeFrame(frame({ diskUsedBytes: 99_000_000_000 }))).toBeNull();
    expect(parseRuntimeFrame(JSON.stringify({ type: "host.stats" }))).toBeNull();
  });
});

describe("a preview's port from a runtime", () => {
  test("says when it opened, and why it closed", () => {
    expect(parseRuntimeFrame(JSON.stringify({ type: "port.opened", viewerId: "v1" }))).toEqual({
      type: "port.opened",
      viewerId: "v1",
    });
    expect(
      parseRuntimeFrame(JSON.stringify({ type: "port.closed", viewerId: "v1", reason: "gone" })),
    ).toEqual({ type: "port.closed", viewerId: "v1", reason: "gone" });
  });

  test("needs a viewer and a reason", () => {
    expect(parseRuntimeFrame(JSON.stringify({ type: "port.opened" }))).toBeNull();
    expect(parseRuntimeFrame(JSON.stringify({ type: "port.closed", viewerId: "v1" }))).toBeNull();
  });
});
