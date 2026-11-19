import { describe, expect, test } from "bun:test";
import type { MemoryStore, Message } from "@anvia/core";
import { createBotAgent } from "@aven/agents/bot-agent";
import { scriptedModel, text, toolCall } from "@aven/agents/testing/scripted-model";

import { UnavailableError } from "@aven/server-kit/errors";
import { noWorld } from "../../testing/no-world";
import { TalkBotReplier } from "./talk-replier";
import type { BotReplyBots, BotReplyInput } from "./types";
import type { BotRunChoice } from "../providers/types";
import type { Bot } from "@aven/protocol/types";

const bot: Bot = {
  id: "b1",
  name: "Pip",
  handle: "main",
  instruction: "Talk.",
  description: "",
  avatar: "",
  providerId: null,
  modelId: null,
  reasoningEffort: null,
  compactAfterTokens: null,
  hasComputer: false,
  runtimeId: null,
  isMain: true,
  attention: null,
  createdAt: "",
  updatedAt: "",
};

const choice: BotRunChoice = { backend: "native", model: { provider: "openai" } };

function store(): MemoryStore {
  const sessions = new Map<string, Message[]>();
  return {
    load: async ({ scope }) => sessions.get(scope.sessionId) ?? [],
    append: async ({ scope, messages }) => {
      const kept = sessions.get(scope.sessionId) ?? [];
      kept.push(...messages);
      sessions.set(scope.sessionId, kept);
    },
    clear: async ({ scope }) => void sessions.delete(scope.sessionId),
  };
}

const send = (message: string) => toolCall("send_message", { text: message });

const unused = async (): Promise<never> => {
  throw new Error("not needed here");
};

function replyBots(overrides: Partial<BotReplyBots> = {}): BotReplyBots {
  return {
    list: async () => [bot],
    deliver: async () => ({ handle: "scout", name: "Scout" }),
    create: async () => unused(),
    update: async () => bot,
    remove: async () => undefined,
    greet: async () => undefined,
    timezone: async () => "Asia/Jakarta",
    schedules: {
      list: async () => [],
      create: async () => unused(),
      update: async () => unused(),
      remove: async () => undefined,
    },
    api: { answer: async () => ({ routes: [], organizations: [] }) },
    ...overrides,
  };
}

const noMcp = {
  forRun: async () => [],
  list: async () => [],
  add: async () => unused(),
  update: async () => unused(),
  remove: async () => undefined,
  record: async () => undefined,
};

const noProviders = {
  list: async () => [],
  add: async () => unused(),
  update: async () => unused(),
  remove: async () => undefined,
  models: async () => ({ models: [] }),
  keyFor: async () => unused(),
};

const noThreads = {
  projects: async () => [],
  list: async () => [],
  get: async () => unused(),
  start: async () => unused(),
  continue: async () => unused(),
  archive: async () => unused(),
  stop: async () => unused(),
  answer: async () => unused(),
};

const noNotes = {
  keepDigest: async () => undefined,
  folders: async () => [],
  run: async () => "",
};

function replier(steps: Parameters<typeof scriptedModel>[0], bots = replyBots()) {
  return new TalkBotReplier(
    {
      store: store(),
      bots,
      world: noWorld,
      mcp: noMcp,
      providers: noProviders,
      threads: noThreads,
      notes: noNotes,
    },
    async () => undefined,
    (options) => createBotAgent({ ...options, model: scriptedModel(steps) }),
  );
}

function input(say: (text: string) => void, speaking: Bot = bot): BotReplyInput {
  return {
    bot: speaking,
    userId: "u1",
    choice,
    prompt: "hello",
    hops: 0,
    onPersonsWord: true,
    say,
    ask: () => undefined,
    react: (messageId) => ({ messageId }),
    signal: new AbortController().signal,
  };
}

describe("a bot with no computer", () => {
  test("answers without a runner", async () => {
    const said: string[] = [];
    await replier([[send("hello")], [text("")]]).answer(input((text) => said.push(text)));
    expect(said).toEqual(["hello"]);
  });

  test("cannot send a file", async () => {
    let seen = "";
    await replier([
      [toolCall("send_message", { text: "see", files: [{ path: "/tmp/a.txt" }] })],
      (request) => {
        seen = JSON.stringify(request);
        return [text("")];
      },
    ]).answer(input(() => undefined));
    expect(seen).toContain("no computer");
  });

  test("the main bot makes and deletes bots from its chat, with no computer", async () => {
    const done: string[] = [];
    const scout = { ...bot, id: "b2", name: "Scout", handle: "scout", isMain: false };
    const bots = replyBots({
      list: async () => [bot, scout],
      create: async (_userId, made) => {
        done.push(`made ${made.name}: ${made.instruction}`);
        return scout;
      },
      remove: async () => {
        done.push("removed scout");
      },
    });
    const said: string[] = [];
    await replier(
      [
        [toolCall("create_bot", { name: "Scout", instruction: "You research." })],
        [toolCall("delete_bot", { handle: "scout" })],
        [send("both done")],
        [text("")],
      ],
      bots,
    ).answer(input((text) => said.push(text)));
    expect(done).toEqual(["made Scout: You research.", "removed scout"]);
    expect(said).toEqual(["both done"]);
  });

  test("a bot that is not the main one is not offered the bot tools", async () => {
    let seen = "";
    const scout = { ...bot, handle: "scout", isMain: false };
    await replier([
      (request) => {
        seen = JSON.stringify(request);
        return [text("")];
      },
    ]).answer(input(() => undefined, scout));
    expect(seen).not.toContain('"create_bot"');
    expect(seen).not.toContain('"delete_bot"');
  });

  test("it is offered everything that needs no computer, and told where to get one", async () => {
    let seen = "";
    await replier([
      (request) => {
        seen = JSON.stringify(request);
        return [text("")];
      },
    ]).answer(input(() => undefined));
    for (const tool of [
      "create_bot",
      "delete_bot",
      "update_self",
      "list_schedules",
      "list_providers",
      "list_mcp_servers",
      "list_threads",
      "aven_api",
      "memory",
      "cockpit",
      "read_project_file",
    ])
      expect(seen).toContain(`"${tool}"`);
    expect(seen).toContain("Settings > Bots");
    expect(seen).not.toContain('"exec_command"');
  });

  test("a subscription agent is refused before any reply", () => {
    const quiet = replier([]);
    expect(() => quiet.ready({ backend: "claude", token: "t" }, bot)).toThrow(UnavailableError);
    expect(() => quiet.ready({ backend: "native" }, bot)).toThrow("no model");
  });
});
