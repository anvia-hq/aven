import { describe, expect, test } from "bun:test";
import type { MemoryStore, Message } from "@anvia/core";
import { createBotAgent } from "@aven/agents/bot-agent";
import { scriptedModel, text, toolCall } from "@aven/agents/testing/scripted-model";

import { UnavailableError } from "@aven/server-kit/errors";
import { noWorld } from "../../testing/no-world";
import { TalkBotReplier } from "./talk-replier";
import type { BotReplyInput } from "./types";
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

function replier(steps: Parameters<typeof scriptedModel>[0]) {
  return new TalkBotReplier(
    store(),
    { list: async () => [bot], deliver: async () => ({ handle: "scout", name: "Scout" }) },
    noWorld,
    async () => undefined,
    (options) => createBotAgent({ ...options, model: scriptedModel(steps) }),
  );
}

function input(say: (text: string) => void): BotReplyInput {
  return {
    bot,
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

  test("a subscription agent is refused before any reply", () => {
    const quiet = replier([]);
    expect(() => quiet.ready({ backend: "claude", token: "t" }, bot)).toThrow(UnavailableError);
    expect(() => quiet.ready({ backend: "native" }, bot)).toThrow("no model");
  });
});
