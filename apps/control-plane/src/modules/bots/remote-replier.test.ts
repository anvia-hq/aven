import { describe, expect, test } from "bun:test";
import type { MemoryStore } from "@anvia/core";
import type { ModelConfig } from "@aven/agents/model";
import type { Bot } from "@aven/protocol/bots";
import type { BotReplyInfo, RunModel } from "@aven/protocol/runtime-wire";

import { ModelUnavailableError } from "../providers/resolve-model";
import { RuntimeOfflineError, type BotReplySink, type RuntimeHub } from "../runtimes/hub";
import { RemoteBotReplier } from "./remote-replier";

const bot: Bot = {
  id: "b1",
  name: "Pip",
  instruction: "Talk like a pirate.",
  avatar: "",
  providerId: null,
  modelId: null,
  reasoningEffort: null,
  compactAfterTokens: 30_000,
  isMain: true,
  createdAt: "",
  updatedAt: "",
};
const openai: ModelConfig = { provider: "openai" };
const runModel: RunModel = { provider: "openai", gatewayPath: "/g", gatewayToken: "tok" };

const store: MemoryStore = {
  load: async () => [],
  append: async () => undefined,
  clear: async () => undefined,
};

// A connection that remembers what it was asked and lets a test play the runner.
function fakeRunner(options: { online?: boolean; keyless?: boolean; store?: MemoryStore } = {}) {
  const started: { replyId: string; bot: BotReplyInfo; prompt: string; model: RunModel }[] = [];
  const cancelled: { replyId: string; reason: string }[] = [];
  const sinks = new Map<string, BotReplySink>();
  const connection = {
    startBotReply(
      replyId: string,
      input: { bot: BotReplyInfo; prompt: string; model: RunModel },
      sink: BotReplySink,
    ) {
      started.push({ replyId, ...input });
      sinks.set(replyId, sink);
    },
    cancelBotReply: (replyId: string, reason: string) => void cancelled.push({ replyId, reason }),
  };
  const asked: string[] = [];
  const hub = {
    get: (runtimeId: string) => {
      asked.push(runtimeId);
      return options.online === false ? undefined : connection;
    },
  } as unknown as Pick<RuntimeHub, "get">;
  const grants: { checked: string[]; issued: string[]; revoked: string[] } = {
    checked: [],
    issued: [],
    revoked: [],
  };
  const gateway = {
    check: (model: ModelConfig) => {
      if (options.keyless) throw new ModelUnavailableError("OPENAI_API_KEY is not set");
      grants.checked.push(model.provider);
    },
    issue: (replyId: string) => (grants.issued.push(replyId), runModel),
    revoke: (replyId: string) => void grants.revoked.push(replyId),
  };
  const replier = new RemoteBotReplier(hub, gateway, options.store ?? store, "runner-1");
  const only = () => [...sinks.values()][0]!;
  return { replier, started, cancelled, grants, asked, only };
}

const input = (say: (text: string) => void, signal = new AbortController().signal) => ({
  bot,
  userId: "u1",
  model: { provider: "openai" as const },
  prompt: "ahoy",
  say,
  signal,
});

describe("RemoteBotReplier", () => {
  test("is refused when the bot's runner is offline", () => {
    const { replier, asked } = fakeRunner({ online: false });
    expect(() => replier.ready(openai)).toThrow(RuntimeOfflineError);
    expect(asked).toEqual(["runner-1"]);
  });

  test("is refused when the model has no key, before any grant is made", () => {
    const run = fakeRunner({ keyless: true });
    expect(() => run.replier.ready(openai)).toThrow(ModelUnavailableError);
    expect(run.grants.issued).toEqual([]);

    const usable = fakeRunner();
    usable.replier.ready(openai);
    expect(usable.grants.checked).toEqual(["openai"]);
    expect(usable.grants.issued).toEqual([]);
  });

  test("sends the runner the bot, what was said and a token for its model", async () => {
    const run = fakeRunner();
    const answering = run.replier.answer(input(() => undefined));

    expect(run.started).toHaveLength(1);
    expect(run.started[0]).toMatchObject({
      bot: {
        id: "b1",
        name: "Pip",
        instruction: "Talk like a pirate.",
        compactAfterTokens: 30_000,
      },
      prompt: "ahoy",
      model: runModel,
    });
    // The grant lasts as long as the reply.
    expect(run.grants.revoked).toEqual([]);
    run.only().end();
    await answering;
    expect(run.grants.revoked).toEqual(run.grants.issued);
  });

  test("what the bot says is shown, and the reply ends when the runner says it has", async () => {
    const run = fakeRunner();
    const said: string[] = [];
    const answering = run.replier.answer(input((text) => said.push(text)));

    run.only().say("arr");
    run.only().say("matey");
    run.only().end();

    await answering;
    expect(said).toEqual(["arr", "matey"]);
  });

  test("a reply the runner ends with an error fails, and so does one it loses", async () => {
    const failed = fakeRunner();
    const first = failed.replier.answer(input(() => undefined));
    failed.only().end("the model is down");
    await expect(first).rejects.toThrow("the model is down");
    expect(failed.grants.revoked).toEqual(failed.grants.issued);

    const lost = fakeRunner();
    const second = lost.replier.answer(input(() => undefined));
    lost.only().lost(new Error("The runtime disconnected"));
    await expect(second).rejects.toThrow("The runtime disconnected");
    expect(lost.grants.revoked).toEqual(lost.grants.issued);
  });

  test("a reply whose turn comes after a shutdown never reaches the runner", async () => {
    const run = fakeRunner();
    const controller = new AbortController();
    controller.abort(new Error("Shutting down"));

    await expect(run.replier.answer(input(() => undefined, controller.signal))).rejects.toThrow(
      "Shutting down",
    );
    expect(run.started).toEqual([]);
    expect(run.grants.issued).toEqual([]);
  });

  test("a cancel reaches the runner, which ends the reply", async () => {
    const run = fakeRunner();
    const controller = new AbortController();
    const answering = run.replier.answer(input(() => undefined, controller.signal));

    controller.abort(new Error("Shutting down"));
    expect(run.cancelled).toEqual([{ replyId: run.started[0]!.replyId, reason: "Shutting down" }]);

    run.only().end("Shutting down");
    await expect(answering).rejects.toThrow("Shutting down");
  });

  test("answers the runner's questions about the conversation for the bot's own scope", async () => {
    const scopes: unknown[] = [];
    const run = fakeRunner({
      store: { ...store, load: async ({ scope }) => (scopes.push(scope), []) },
    });
    const answering = run.replier.answer(input(() => undefined));

    await run.only().memory({ replyId: "whatever the runner says", op: "load" });

    expect(scopes).toEqual([{ sessionId: "b1", userId: "u1" }]);
    run.only().end();
    await answering;
  });
});
