import { describe, expect, test } from "bun:test";

import { BOT_DESCRIPTION_MAX, BOT_INSTRUCTION_MAX, BOT_MESSAGE_MAX, BOT_NAME_MAX } from "../bots";
import {
  parseBotApiParams,
  parseBotCockpitParams,
  parseBotCreateParams,
  parseBotDeleteParams,
  parseBotGoalParams,
  parseBotMcpParams,
  parseBotMemoryParams,
  parseBotNotesParams,
  parseBotProjectParams,
  parseBotProviderParams,
  parseBotQuestionParams,
  parseBotReactParams,
  parseBotScheduleParams,
  parseBotSendParams,
  parseBotSkillParams,
  parseBotThreadParams,
  parseBotUpdateParams,
} from "./bot-calls";

const UUID = "11111111-2222-4333-8444-555555555555";
const UUID_2 = "66666666-7777-4888-8999-000000000000";
const DIGEST = "a".repeat(64);

describe("bot memory, lifecycle, and messaging calls", () => {
  test("parseBotMemoryParams accepts load, append, snapshot, replacePrefix and refuses clear", () => {
    const base = { replyId: "r1" };
    expect(parseBotMemoryParams({ ...base, op: "load" })).toEqual({ replyId: "r1", op: "load" });
    expect(
      parseBotMemoryParams({ ...base, op: "append", runId: "x", turn: 1, messages: [{}] }),
    ).toMatchObject({ op: "append", turn: 1 });
    expect(parseBotMemoryParams({ ...base, op: "snapshot" })).toEqual({
      replyId: "r1",
      op: "snapshot",
    });
    expect(
      parseBotMemoryParams({
        ...base,
        op: "replacePrefix",
        runId: "x",
        revision: "1",
        messageCount: 2,
        replacement: {},
      }),
    ).toMatchObject({ op: "replacePrefix", messageCount: 2 });

    expect(() => parseBotMemoryParams({ ...base, op: "clear" })).toThrow("Invalid parameters");
    expect(() => parseBotMemoryParams({ op: "load" })).toThrow("Invalid parameters");
    expect(() =>
      parseBotMemoryParams({ ...base, op: "append", runId: "x", turn: -1, messages: [] }),
    ).toThrow("Invalid parameters");
  });

  test("parseBotCreateParams trims and enforces limits", () => {
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
      expect(() => parseBotCreateParams(bad)).toThrow("Invalid parameters");
    }
  });

  test("parseBotDeleteParams validates handle", () => {
    expect(parseBotDeleteParams({ replyId: "r1", handle: " scout " })).toEqual({
      replyId: "r1",
      handle: "scout",
    });
    expect(() => parseBotDeleteParams({ replyId: "r1", handle: "   " })).toThrow();
    expect(() => parseBotDeleteParams({ replyId: "r1", handle: "a".repeat(65) })).toThrow();
  });

  test("parseBotUpdateParams requires at least one changed field within limits", () => {
    expect(parseBotUpdateParams({ replyId: "r1", name: " Scout " })).toEqual({
      replyId: "r1",
      name: "Scout",
    });
    expect(parseBotUpdateParams({ replyId: "r1", description: "" }).description).toBe("");
    expect(parseBotUpdateParams({ replyId: "r1", instruction: "" }).instruction).toBe("");

    for (const bad of [
      { replyId: "r1" },
      { replyId: "", name: "Scout" },
      { replyId: "r1", name: " " },
      { replyId: "r1", name: "x".repeat(BOT_NAME_MAX + 1) },
      { replyId: "r1", description: "x".repeat(BOT_DESCRIPTION_MAX + 1) },
      { replyId: "r1", instruction: "x".repeat(BOT_INSTRUCTION_MAX + 1) },
    ]) {
      expect(() => parseBotUpdateParams(bad)).toThrow("Invalid parameters");
    }
  });

  test("parseBotSendParams validates handle and text", () => {
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
      expect(() => parseBotSendParams(bad)).toThrow("Invalid parameters");
    }
  });

  test("parseBotReactParams accepts a single emoji and rejects words", () => {
    expect(parseBotReactParams({ replyId: "r1", messageId: "m-3", emoji: "🎉" })).toEqual({
      replyId: "r1",
      messageId: "m-3",
      emoji: "🎉",
    });
    expect(() =>
      parseBotReactParams({ replyId: "r1", messageId: "m-3", emoji: "great!" }),
    ).toThrow();
    expect(() => parseBotReactParams({ replyId: "r1", messageId: "bad", emoji: "👍" })).toThrow();
  });

  test("parseBotQuestionParams transforms choices to label/value pairs", () => {
    expect(
      parseBotQuestionParams({
        replyId: "r1",
        questions: [{ id: "q1", text: "Which?", choices: [{ label: "A" }, { label: "B" }] }],
      }),
    ).toEqual({
      replyId: "r1",
      questions: [
        {
          id: "q1",
          text: "Which?",
          choices: [
            { label: "A", value: "A" },
            { label: "B", value: "B" },
          ],
        },
      ],
    });
    expect(() => parseBotQuestionParams({ replyId: "r1", questions: [] })).toThrow();
  });
});

describe("bot schedules and goals", () => {
  test("parseBotScheduleParams validates list, create, update, and delete", () => {
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
    expect(
      parseBotScheduleParams({ replyId: "r1", op: "update", id: UUID, enabled: false }),
    ).toEqual({ replyId: "r1", op: "update", id: UUID, enabled: false });
    expect(parseBotScheduleParams({ replyId: "r1", op: "delete", id: UUID })).toEqual({
      replyId: "r1",
      op: "delete",
      id: UUID,
    });

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

  test("parseBotGoalParams validates get, start, and update", () => {
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

describe("bot mcp and provider calls", () => {
  test("parseBotMcpParams validates all operations and rejects duplicate header names", () => {
    expect(parseBotMcpParams({ replyId: "r1", op: "list" })).toEqual({ replyId: "r1", op: "list" });
    expect(
      parseBotMcpParams({
        replyId: "r1",
        op: "add",
        name: "Linear",
        url: "https://mcp.linear.app/sse",
        headers: [{ name: "Authorization", value: "Bearer tok" }],
        target: "all",
      }),
    ).toEqual({
      replyId: "r1",
      op: "add",
      name: "Linear",
      url: "https://mcp.linear.app/sse",
      headers: [{ name: "Authorization", value: "Bearer tok" }],
      target: "all",
    });
    expect(parseBotMcpParams({ replyId: "r1", op: "update", id: UUID, enabled: false })).toEqual({
      replyId: "r1",
      op: "update",
      id: UUID,
      enabled: false,
    });
    expect(parseBotMcpParams({ replyId: "r1", op: "remove", id: UUID })).toEqual({
      replyId: "r1",
      op: "remove",
      id: UUID,
    });
    expect(
      parseBotMcpParams({
        replyId: "r1",
        op: "report",
        results: [{ id: UUID, error: " timeout " }],
      }),
    ).toEqual({
      replyId: "r1",
      op: "report",
      results: [{ id: UUID, error: "timeout" }],
    });

    expect(() =>
      parseBotMcpParams({
        replyId: "r1",
        op: "add",
        name: "Dup",
        url: "https://example.com/mcp",
        headers: [
          { name: "X-Key", value: "1" },
          { name: "x-key", value: "2" },
        ],
      }),
    ).toThrow("Invalid parameters");
    expect(() =>
      parseBotMcpParams({
        replyId: "r1",
        op: "report",
        results: [{ id: "not-a-uuid" }],
      }),
    ).toThrow("Invalid parameters");
  });

  test("parseBotProviderParams validates all operations and enforces URL format on add and update", () => {
    expect(parseBotProviderParams({ replyId: "r1", op: "list" })).toEqual({
      replyId: "r1",
      op: "list",
    });
    expect(
      parseBotProviderParams({
        replyId: "r1",
        op: "add",
        kind: "openai-compatible",
        name: " Local ",
        baseUrl: "http://localhost:11434/v1///",
        modelId: "llama3",
        isDefault: true,
      }),
    ).toEqual({
      replyId: "r1",
      op: "add",
      kind: "openai-compatible",
      name: "Local",
      baseUrl: "http://localhost:11434/v1",
      modelId: "llama3",
      isDefault: true,
    });
    expect(
      parseBotProviderParams({
        replyId: "r1",
        op: "update",
        id: UUID,
        baseUrl: "https://api.example.com/v1/",
        isDefault: true,
      }),
    ).toEqual({
      replyId: "r1",
      op: "update",
      id: UUID,
      baseUrl: "https://api.example.com/v1",
      isDefault: true,
    });
    expect(parseBotProviderParams({ replyId: "r1", op: "remove", id: UUID })).toEqual({
      replyId: "r1",
      op: "remove",
      id: UUID,
    });
    expect(parseBotProviderParams({ replyId: "r1", op: "models", id: UUID })).toEqual({
      replyId: "r1",
      op: "models",
      id: UUID,
    });
    expect(parseBotProviderParams({ replyId: "r1", op: "askKey", id: UUID })).toEqual({
      replyId: "r1",
      op: "askKey",
      id: UUID,
    });

    for (const bad of [
      { replyId: "r1", op: "add", kind: "openai-compatible", name: "Bad", baseUrl: "not-a-url" },
      {
        replyId: "r1",
        op: "add",
        kind: "openai-compatible",
        name: "Bad",
        baseUrl: "ftp://example.com",
      },
      { replyId: "r1", op: "update", id: UUID, isDefault: false },
      { replyId: "r1", op: "remove", id: "not-a-uuid" },
    ]) {
      expect(() => parseBotProviderParams(bad)).toThrow("Invalid parameters");
    }
  });
});

describe("bot threads, projects, skills, notes, cockpit, and api calls", () => {
  test("parseBotThreadParams validates every operation", () => {
    const base = { replyId: "r1" };
    expect(parseBotThreadParams({ ...base, op: "projects" })).toEqual({ ...base, op: "projects" });
    expect(
      parseBotThreadParams({ ...base, op: "list", projectId: UUID_2, archived: true }),
    ).toEqual({ ...base, op: "list", projectId: UUID_2, archived: true });
    expect(parseBotThreadParams({ ...base, op: "get", id: UUID })).toEqual({
      ...base,
      op: "get",
      id: UUID,
    });
    expect(
      parseBotThreadParams({
        ...base,
        op: "start",
        projectId: UUID_2,
        prompt: "  Fix it ",
        title: "Fix",
        modelId: "gpt-5",
      }),
    ).toEqual({
      ...base,
      op: "start",
      projectId: UUID_2,
      prompt: "Fix it",
      title: "Fix",
      modelId: "gpt-5",
    });
    expect(parseBotThreadParams({ ...base, op: "continue", id: UUID, prompt: "More" })).toEqual({
      ...base,
      op: "continue",
      id: UUID,
      prompt: "More",
    });
    expect(parseBotThreadParams({ ...base, op: "archive", id: UUID })).toEqual({
      ...base,
      op: "archive",
      id: UUID,
    });
    expect(parseBotThreadParams({ ...base, op: "stop", id: UUID })).toEqual({
      ...base,
      op: "stop",
      id: UUID,
    });
    expect(
      parseBotThreadParams({
        ...base,
        op: "answer",
        id: UUID,
        answers: [{ questionId: "q1", value: "Draft" }],
      }),
    ).toEqual({
      ...base,
      op: "answer",
      id: UUID,
      answers: [{ questionId: "q1", value: "Draft" }],
    });

    for (const bad of [
      { ...base, op: "start", prompt: "Fix it" },
      { ...base, op: "start", projectId: "main", prompt: "Fix it" },
      { ...base, op: "start", projectId: UUID_2, prompt: "   " },
      { ...base, op: "start", projectId: UUID_2, prompt: "x".repeat(20_001) },
      { ...base, op: "continue", id: "latest", prompt: "More" },
      { ...base, op: "get" },
      { ...base, op: "archive", id: UUID, archived: "yes" },
      { ...base, op: "answer", id: UUID, answers: [] },
      { ...base, op: "delete", id: UUID },
      { op: "projects" },
    ]) {
      expect(() => parseBotThreadParams(bad)).toThrow("Invalid parameters");
    }
  });

  test("parseBotProjectParams validates folder and file operations", () => {
    const base = { replyId: "r1", projectId: UUID };
    expect(parseBotProjectParams({ ...base, op: "folder" })).toEqual({ ...base, op: "folder" });
    expect(parseBotProjectParams({ ...base, op: "file", path: "src/a.ts" })).toEqual({
      ...base,
      op: "file",
      path: "src/a.ts",
    });
    expect(parseBotProjectParams({ ...base, op: "folder", workspaceId: "w" })).toEqual({
      ...base,
      op: "folder",
    });
    expect(() => parseBotProjectParams({ ...base, op: "file" })).toThrow();
    expect(() => parseBotProjectParams({ ...base, projectId: "x", op: "folder" })).toThrow();
  });

  test("parseBotSkillParams validates SHA-256 digest", () => {
    expect(parseBotSkillParams({ replyId: "r1", digest: DIGEST })).toEqual({
      replyId: "r1",
      digest: DIGEST,
    });
    expect(() => parseBotSkillParams({ replyId: "r1", digest: "short" })).toThrow();
  });

  test("parseBotNotesParams validates memory commands", () => {
    expect(
      parseBotNotesParams({
        replyId: "r1",
        command: { command: "view", path: "/memories/bot/a.md", viewRange: [1, 10] },
      }),
    ).toEqual({
      replyId: "r1",
      command: { command: "view", path: "/memories/bot/a.md", viewRange: [1, 10] },
    });
    expect(() =>
      parseBotNotesParams({ replyId: "r1", command: { command: "view", path: "" } }),
    ).toThrow();
  });

  test("parseBotCockpitParams requires replyId and passes command through", () => {
    expect(parseBotCockpitParams({ replyId: "r1", command: { command: "tags" } })).toEqual({
      replyId: "r1",
      command: { command: "tags" },
    });
    expect(() => parseBotCockpitParams({ replyId: "", command: {} })).toThrow();
  });

  test("parseBotApiParams validates search and call operations", () => {
    expect(parseBotApiParams({ replyId: "r1", op: "search", query: " threads " })).toEqual({
      replyId: "r1",
      op: "search",
      query: "threads",
    });
    expect(
      parseBotApiParams({
        replyId: "r1",
        op: "call",
        method: "POST",
        path: "/api/threads",
        body: { a: 1 },
        confirmed: true,
      }),
    ).toEqual({
      replyId: "r1",
      op: "call",
      method: "POST",
      path: "/api/threads",
      body: { a: 1 },
      confirmed: true,
    });

    expect(() =>
      parseBotApiParams({ replyId: "r1", op: "call", method: "HEAD", path: "/api/threads" }),
    ).toThrow();
    expect(() =>
      parseBotApiParams({ replyId: "r1", op: "call", method: "GET", path: "" }),
    ).toThrow();
  });
});
