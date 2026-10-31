import { describe, expect, test } from "bun:test";
import type { MemoryStore } from "@anvia/core";
import type { ModelConfig } from "@aven/agents/model";
import type { Bot } from "@aven/protocol/bots";
import type { BotReplyInfo, RunModel } from "@aven/protocol/runtime-wire";

import { ModelUnavailableError } from "../providers/resolve-model";
import { RuntimeOfflineError, type BotReplySink, type RuntimeHub } from "../runtimes/hub";
import { RemoteBotReplier, type BotKeeper } from "./remote-replier";
import type { NewBot } from "./service";

const bot: Bot = {
  id: "b1",
  name: "Pip",
  instruction: "Talk like a pirate.",
  description: "Sails the seas.",
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
function fakeRunner(
  options: {
    online?: boolean;
    keyless?: boolean;
    store?: MemoryStore;
    bots?: Partial<BotKeeper>;
  } = {},
) {
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
  const replier = new RemoteBotReplier(hub, gateway, options.store ?? store, "runner-1", {
    list: async () => [bot],
    create: async () => bot,
    update: async () => bot,
    ask: async () => ({ bot: "Scout", replies: [] }),
    greet: async () => undefined,
    ...options.bots,
  });
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

  test("grants nothing when the list of the main bot's peers cannot be had", async () => {
    const run = fakeRunner({
      bots: {
        list: async () => {
          throw new Error("database is down");
        },
      },
    });

    await expect(run.replier.answer(input(() => undefined))).rejects.toThrow("database is down");
    expect(run.grants.issued).toEqual([]);
    expect(run.started).toEqual([]);
  });

  test("does not start a reply that a shutdown overtook while the peers were listed", async () => {
    const controller = new AbortController();
    const run = fakeRunner({
      bots: {
        list: async () => {
          controller.abort(new Error("Shutting down"));
          return [bot];
        },
      },
    });

    await expect(run.replier.answer(input(() => undefined, controller.signal))).rejects.toThrow(
      "Shutting down",
    );
    expect(run.started).toEqual([]);
    expect(run.grants.issued).toEqual([]);
  });

  test("sends the runner the bot, what was said and a token for its model", async () => {
    const run = fakeRunner();
    const answering = run.replier.answer(input(() => undefined));
    await Bun.sleep(0);

    expect(run.started).toHaveLength(1);
    expect(run.started[0]).toMatchObject({
      bot: {
        id: "b1",
        name: "Pip",
        instruction: "Talk like a pirate.",
        compactAfterTokens: 30_000,
        description: "Sails the seas.",
        canCreateBots: true,
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
    await Bun.sleep(0);

    run.only().say("arr");
    run.only().say("matey");
    run.only().end();

    await answering;
    expect(said).toEqual(["arr", "matey"]);
  });

  test("a reply the runner ends with an error fails, and so does one it loses", async () => {
    const failed = fakeRunner();
    const first = failed.replier.answer(input(() => undefined));
    await Bun.sleep(0);
    failed.only().end("the model is down");
    await expect(first).rejects.toThrow("the model is down");
    expect(failed.grants.revoked).toEqual(failed.grants.issued);

    const lost = fakeRunner();
    const second = lost.replier.answer(input(() => undefined));
    await Bun.sleep(0);
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
    await Bun.sleep(0);

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
    await Bun.sleep(0);

    await run.only().memory({ replyId: "whatever the runner says", op: "load" });

    expect(scopes).toEqual([{ sessionId: "b1", userId: "u1" }]);
    run.only().end();
    await answering;
  });

  describe("a bot that makes bots", () => {
    const made: Bot = { ...bot, id: "b2", name: "Scout", isMain: false };
    const wanted = { replyId: "x", name: "Scout", instruction: "You research." };

    test("the main bot's new bot is made for its own person, and the runner is told which", async () => {
      const calls: { userId: string; bot: NewBot }[] = [];
      const run = fakeRunner({
        bots: { create: async (userId, newBot) => (calls.push({ userId, bot: newBot }), made) },
      });
      const answering = run.replier.answer(input(() => undefined));
      await Bun.sleep(0);

      const result = await run.only().create(wanted);

      expect(result).toEqual({ id: "b2", name: "Scout" });
      expect(calls).toEqual([
        {
          userId: "u1",
          bot: {
            name: "Scout",
            instruction: "You research.",
            description: undefined,
          },
        },
      ]);
      run.only().end();
      await answering;
    });

    test("the new bot says hello to its person, unasked, and is not waited for", async () => {
      const greeted: { userId: string; botId: string }[] = [];
      const run = fakeRunner({
        bots: {
          create: async () => made,
          greet: async (userId, botId) => {
            greeted.push({ userId, botId });
            await new Promise(() => undefined);
          },
        },
      });
      const answering = run.replier.answer(input(() => undefined));
      await Bun.sleep(0);

      // A hello that never ends does not hold up the main bot's tool call.
      expect(await run.only().create(wanted)).toEqual({ id: "b2", name: "Scout" });
      expect(greeted).toEqual([{ userId: "u1", botId: "b2" }]);
      run.only().end();
      await answering;
    });

    test("a hello that fails does not fail making the bot", async () => {
      const run = fakeRunner({
        bots: {
          create: async () => made,
          greet: async () => {
            throw new Error("no model to answer with");
          },
        },
      });
      const answering = run.replier.answer(input(() => undefined));
      await Bun.sleep(0);

      expect(await run.only().create(wanted)).toEqual({ id: "b2", name: "Scout" });
      run.only().end();
      await answering;
    });

    test("another bot may not, and is not told it can", async () => {
      const calls: string[] = [];
      const run = fakeRunner({ bots: { create: async (userId) => (calls.push(userId), made) } });
      const answering = run.replier.answer({
        ...input(() => undefined),
        bot: { ...bot, isMain: false },
      });
      await Bun.sleep(0);

      expect(run.started[0]!.bot.canCreateBots).toBe(false);
      await expect(run.only().create(wanted)).rejects.toThrow("Only your main bot");
      expect(calls).toEqual([]);
      run.only().end();
      await answering;
    });
  });

  describe("a bot that changes itself", () => {
    test("any bot changes its own record, for its own person, whichever bot the runner names", async () => {
      const calls: { userId: string; id: string; changes: unknown }[] = [];
      const run = fakeRunner({
        bots: {
          update: async (userId, id, changes) => (
            calls.push({ userId, id, changes }),
            { ...bot, isMain: false, name: "Scout 2", description: "Looks things up." }
          ),
        },
      });
      const answering = run.replier.answer({
        ...input(() => undefined),
        bot: { ...bot, isMain: false },
      });
      await Bun.sleep(0);

      const result = await run.only().update({ replyId: "x", description: "Looks things up." });

      expect(result).toEqual({ name: "Scout 2", description: "Looks things up." });
      expect(calls).toEqual([
        {
          userId: "u1",
          id: "b1",
          changes: { name: undefined, description: "Looks things up.", instruction: undefined },
        },
      ]);
      run.only().end();
      await answering;
    });

    test("a bot that is gone cannot be changed", async () => {
      const run = fakeRunner({ bots: { update: async () => null } });
      const answering = run.replier.answer(input(() => undefined));
      await Bun.sleep(0);

      await expect(run.only().update({ replyId: "x", name: "Pip 2" })).rejects.toThrow("no longer");
      run.only().end();
      await answering;
    });
  });

  describe("a bot that writes to other bots", () => {
    const scout: Bot = {
      ...bot,
      id: "b2",
      name: "Scout",
      description: "Looks things up.",
      isMain: false,
    };

    test("the main bot is told which bots it may write to, not itself", async () => {
      const run = fakeRunner({ bots: { list: async () => [bot, scout] } });
      const answering = run.replier.answer(input(() => undefined));
      await Bun.sleep(5);
      await Bun.sleep(0);

      expect(run.started[0]!.bot.peers).toEqual([
        { id: "b2", name: "Scout", description: "Looks things up." },
      ]);
      run.only().end();
      await answering;
    });

    test("it writes as itself, for its own person, and hears what the other bot sent", async () => {
      const asked: { userId: string; from: string; botId: string; text: string }[] = [];
      const run = fakeRunner({
        bots: {
          list: async () => [bot, scout],
          ask: async (userId, from, botId, text) => (
            asked.push({ userId, from: from.id, botId, text }),
            { bot: "Scout", replies: ["A done"] }
          ),
        },
      });
      const answering = run.replier.answer(input(() => undefined));
      await Bun.sleep(5);
      await Bun.sleep(0);

      const answered = await run.only().ask({ replyId: "x", bot: "b2", text: "do A" });

      expect(answered).toEqual({ bot: "Scout", replies: ["A done"] });
      expect(asked).toEqual([{ userId: "u1", from: "b1", botId: "b2", text: "do A" }]);
      run.only().end();
      await answering;
    });

    test("another bot may not, and is given no one to write to", async () => {
      const asked: string[] = [];
      const run = fakeRunner({
        bots: {
          list: async () => [bot, scout],
          ask: async (userId) => (asked.push(userId), { bot: "Scout", replies: [] }),
        },
      });
      const answering = run.replier.answer({ ...input(() => undefined), bot: scout });
      await Bun.sleep(5);
      await Bun.sleep(0);

      expect(run.started[0]!.bot.peers).toBeUndefined();
      await expect(run.only().ask({ replyId: "x", bot: "b1", text: "hi" })).rejects.toThrow(
        "Only your main bot",
      );
      expect(asked).toEqual([]);
      run.only().end();
      await answering;
    });
  });
});
