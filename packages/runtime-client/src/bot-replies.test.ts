import { describe, expect, test } from "bun:test";
import { Agent, createTool, type AnyTool } from "@anvia/core";
import { scriptedModel, text, toolCall } from "@aven/agents/testing/scripted-model";
import { createCreateBotTool, type CreateBot } from "@aven/agents/tools/create-bot";
import { createMessageBotTool, type MessageBot } from "@aven/agents/tools/message-bot";
import { createSendMessageTool } from "@aven/agents/tools/send-message";
import { createUpdateSelfTool } from "@aven/agents/tools/update-self";
import { BOT_ASK_TIMEOUT_MS } from "@aven/protocol/bots";
import type { RuntimeToControlPlane } from "@aven/protocol/runtime-wire";
import { z } from "zod";

import {
  BotReplies,
  defaultCreateBotAgent,
  type BotReplyMessage,
  type CreateBotReplyAgent,
} from "./bot-replies";
import type { ThreadSandbox, ThreadWorkspaces } from "./sandbox";

const tool = (name: string): AnyTool =>
  createTool({ name, description: name, inputSchema: z.object({}), execute: async () => "ok" });

const model = { provider: "openai", gatewayPath: "/g", gatewayToken: "t" } as const;
const message: BotReplyMessage = {
  type: "bot.reply",
  replyId: "r1",
  bot: { id: "bot-1", name: "Pip", instruction: "", description: "A pal.", canCreateBots: false },
  prompt: "hello",
  model,
};

const makingBots = (createBot?: CreateBot) => (createBot ? [createCreateBotTool(createBot)] : []);
const messagingBots = (messageBot?: MessageBot) =>
  messageBot ? [createMessageBotTool(messageBot)] : [];

// An agent that sends what a script says to, then stops.
const agentThat =
  (...steps: Parameters<typeof scriptedModel>[0]): CreateBotReplyAgent =>
  ({ deliver, computer, memory, createBot, messageBot, updateSelf }) =>
    new Agent({
      id: "bot",
      model: scriptedModel(steps),
      instructions: "x",
      memory,
      tools: [
        createSendMessageTool(deliver),
        ...computer,
        ...makingBots(createBot),
        ...messagingBots(messageBot),
        createUpdateSelfTool(updateSelf),
      ],
    });

const sandboxWith = (acquired: { id: string; repo: unknown }[] = []): ThreadWorkspaces => ({
  async acquire(thread, repo) {
    acquired.push({ id: thread.id, repo });
    return {
      tools: [tool("exec_command"), tool("show_image")],
      hasRunningProcesses: async () => false,
    };
  },
  desktop: () => undefined,
  workspace: async () => undefined,
  release: async () => undefined,
  dispose: async () => undefined,
});

// The control plane's answer to a call about the bot's conversation: nothing said before.
const memoryAnswer = (params: unknown) => ((params as { op?: string }).op === "load" ? [] : null);

function harness(createAgent: CreateBotReplyAgent, options: { linkUp?: () => boolean } = {}) {
  const sent: RuntimeToControlPlane[] = [];
  const calls: unknown[] = [];
  const timeouts: (number | undefined)[] = [];
  const acquired: { id: string; repo: unknown }[] = [];
  const finished: string[] = [];
  const pauses: number[] = [];
  const boxes = new Map<string, ThreadSandbox>();
  const replies = new BotReplies({
    sandbox: sandboxWith(acquired),
    createAgent,
    send: (frame) => {
      if (options.linkUp && !options.linkUp()) return false;
      sent.push(frame);
      return true;
    },
    call: async (method, params, options) => {
      calls.push({ method, params });
      timeouts.push(options?.timeoutMs);
      if (method === "bot.create") return { id: "b2", name: (params as { name: string }).name };
      if (method === "bot.ask") return { bot: "Scout", replies: ["A is done"] };
      if (method === "bot.update") return { name: "Pip", description: "Now for research." };
      return memoryAnswer(params);
    },
    boxes,
    starting: async () => undefined,
    finished: (botId) => void finished.push(botId),
    pause: async (ms) => void pauses.push(ms),
  });
  const ended = () => sent.some((frame) => frame.type === "bot.end");
  const until = async () => {
    for (let i = 0; i < 100 && !ended(); i++) await Bun.sleep(10);
  };
  return { replies, sent, calls, timeouts, acquired, finished, pauses, boxes, until };
}

describe("BotReplies", () => {
  test("the bot's messages go back in order, each after its typing pause, then the reply ends", async () => {
    const run = harness(
      agentThat(
        [
          toolCall("send_message", { text: "hey!" }),
          toolCall("send_message", { text: "how are you?" }),
        ],
        [text("")],
      ),
    );

    run.replies.start(message);
    await run.until();

    expect(run.sent).toEqual([
      { type: "bot.say", replyId: "r1", text: "hey!" },
      { type: "bot.say", replyId: "r1", text: "how are you?" },
      { type: "bot.end", replyId: "r1" },
    ]);
    expect(run.pauses).toHaveLength(2);
    expect(run.finished).toEqual(["bot-1"]);
  });

  test("messages sent in one turn are typed one at a time, never together", async () => {
    let typing = 0;
    let most = 0;
    const sent: RuntimeToControlPlane[] = [];
    const replies = new BotReplies({
      sandbox: sandboxWith(),
      createAgent: agentThat(
        [
          toolCall("send_message", { text: "one" }),
          toolCall("send_message", { text: "two" }),
          toolCall("send_message", { text: "three" }),
        ],
        [text("")],
      ),
      send: (frame) => (sent.push(frame), true),
      call: async (_method, params) => memoryAnswer(params),
      boxes: new Map(),
      starting: async () => undefined,
      finished: () => undefined,
      pause: async () => {
        typing += 1;
        most = Math.max(most, typing);
        await Bun.sleep(2);
        typing -= 1;
      },
    });

    replies.start(message);
    for (let i = 0; i < 100 && !sent.some((frame) => frame.type === "bot.end"); i++) {
      await Bun.sleep(10);
    }

    expect(most).toBe(1);
    expect(sent.filter((frame) => frame.type === "bot.say")).toHaveLength(3);
  });

  test("the bot works on its own computer: no repository, and no show_image, which has nowhere to go", async () => {
    let computer: readonly AnyTool[] = [];
    const run = harness((input) => {
      computer = input.computer;
      return agentThat([text("")])(input);
    });

    run.replies.start(message);
    await run.until();

    expect(run.acquired).toEqual([{ id: "bot-1", repo: undefined }]);
    expect(computer.map((each) => each.name)).toEqual(["exec_command"]);
    expect(run.boxes.has("bot-1")).toBe(true);
  });

  test("the main bot makes a bot by asking the control plane, for its own reply", async () => {
    const run = harness(
      agentThat(
        [toolCall("create_bot", { name: "Scout", instruction: "You research." })],
        [toolCall("send_message", { text: "Scout is ready" })],
        [text("")],
      ),
    );

    run.replies.start({ ...message, bot: { ...message.bot, canCreateBots: true } });
    await run.until();

    expect(run.calls).toContainEqual({
      method: "bot.create",
      params: { replyId: "r1", name: "Scout", instruction: "You research." },
    });
    expect(run.sent).toEqual([
      { type: "bot.say", replyId: "r1", text: "Scout is ready" },
      { type: "bot.end", replyId: "r1" },
    ]);
  });

  test("the main bot writes to another bot by asking the control plane, for its own reply, and waits longer than a call does", async () => {
    const scout = "11111111-2222-4333-8444-555555555555";
    const run = harness(
      agentThat(
        [toolCall("message_bot", { bot: scout, text: "do A" })],
        [toolCall("send_message", { text: "Scout says A is done" })],
        [text("")],
      ),
    );
    const peers = [{ id: scout, name: "Scout", description: "" }];

    run.replies.start({ ...message, bot: { ...message.bot, canCreateBots: true, peers } });
    await run.until();

    expect(run.calls).toContainEqual({
      method: "bot.ask",
      params: { bot: scout, text: "do A", replyId: "r1" },
    });
    // The control plane waits five minutes for the other bot; the call waits a little longer.
    expect(run.timeouts.find((timeout) => timeout !== undefined)).toBeGreaterThan(
      BOT_ASK_TIMEOUT_MS,
    );
    expect(run.sent).toEqual([
      { type: "bot.say", replyId: "r1", text: "Scout says A is done" },
      { type: "bot.end", replyId: "r1" },
    ]);
  });

  test("a bot told of no other bots is not given the tool", async () => {
    let offered: unknown = "unset";
    const run = harness((input) => {
      offered = input.messageBot;
      return agentThat([text("")])(input);
    });

    run.replies.start(message);
    await run.until();

    expect(offered).toBeUndefined();
  });

  test("any bot changes itself by asking the control plane, for its own reply", async () => {
    const run = harness(
      agentThat(
        [toolCall("update_self", { description: "Now for research." })],
        [toolCall("send_message", { text: "Done" })],
        [text("")],
      ),
    );

    run.replies.start(message);
    await run.until();

    expect(run.calls).toContainEqual({
      method: "bot.update",
      params: { replyId: "r1", description: "Now for research." },
    });
    expect(run.sent).toEqual([
      { type: "bot.say", replyId: "r1", text: "Done" },
      { type: "bot.end", replyId: "r1" },
    ]);
  });

  test("the agent is told the bot's description as it is now", async () => {
    let described: string | undefined;
    const run = harness((input) => {
      described = input.bot.description;
      return agentThat([text("")])(input);
    });

    run.replies.start(message);
    await run.until();

    expect(described).toBe("A pal.");
  });

  // Through the real builder, not the test's own: what the agent is made with is what it can do.
  describe("the agent the runner builds", () => {
    const build = (canCreateBots: boolean) =>
      defaultCreateBotAgent("http://control-plane")({
        bot: {
          ...message.bot,
          canCreateBots,
          peers: canCreateBots
            ? [{ id: "b2", name: "Scout", description: "Looks things up." }]
            : undefined,
        },
        model: { provider: "openai", gatewayPath: "/g", gatewayToken: "t" },
        deliver: async () => undefined,
        memory: {
          store: {
            load: async () => [],
            append: async () => undefined,
            clear: async () => undefined,
          },
          savePolicy: "turn",
        },
        computer: [],
        updateSelf: async () => ({ name: "Pip", description: "" }),
        createBot: canCreateBots ? async () => ({ id: "b2", name: "Scout" }) : undefined,
        messageBot: canCreateBots ? async () => ({ bot: "Scout", replies: [] }) : undefined,
      }) as unknown as { tools: { name: string }[]; instructions: string };

    test("every bot can change itself and knows its own description", () => {
      const agent = build(false);
      expect(agent.tools.map((each) => each.name)).toEqual(["send_message", "update_self"]);
      expect(agent.instructions).toContain("Your description now: A pal.");
      expect(agent.instructions).not.toContain("<making-bots>");
    });

    test("the main bot can make bots too", () => {
      const agent = build(true);
      expect(agent.tools.map((each) => each.name)).toEqual([
        "send_message",
        "create_bot",
        "message_bot",
        "update_self",
      ]);
      expect(agent.instructions).toContain("<making-bots>");
      expect(agent.instructions).toContain("- Scout (id: b2): Looks things up.");
    });
  });

  test("a bot that may not make bots is not given the tool", async () => {
    let offered: unknown = "unset";
    const run = harness((input) => {
      offered = input.createBot;
      return agentThat([text("")])(input);
    });

    run.replies.start(message);
    await run.until();

    expect(offered).toBeUndefined();
  });

  test("its conversation is asked of the control plane, not kept here", async () => {
    const run = harness(({ memory, deliver }) => ({
      generate: async () => {
        await memory.store.load({ scope: { sessionId: "bot-1" } });
        await memory.store.append({
          scope: { sessionId: "bot-1" },
          runId: "x",
          turn: 1,
          messages: [],
        });
        await deliver("hi", {});
        return { type: "response" } as never;
      },
    }));

    run.replies.start(message);
    await run.until();

    expect(run.calls).toEqual([
      { method: "bot.memory", params: { replyId: "r1", op: "load" } },
      {
        method: "bot.memory",
        params: { replyId: "r1", op: "append", runId: "x", turn: 1, messages: [] },
      },
    ]);
  });

  test("a failed reply says why", async () => {
    const run = harness(() => ({
      generate: async () => {
        throw new Error("the model is down");
      },
    }));

    run.replies.start(message);
    await run.until();

    expect(run.sent).toEqual([{ type: "bot.end", replyId: "r1", error: "the model is down" }]);
    expect(run.finished).toEqual(["bot-1"]);
  });

  test("a cancel stops the reply, in the middle of a typing pause", async () => {
    const typing = Promise.withResolvers<void>();
    const sent: RuntimeToControlPlane[] = [];
    const replies = new BotReplies({
      sandbox: sandboxWith(),
      createAgent: agentThat([toolCall("send_message", { text: "never" })], [text("")]),
      send: (frame) => (sent.push(frame), true),
      call: async (_method, params) => memoryAnswer(params),
      boxes: new Map(),
      starting: async () => undefined,
      finished: () => undefined,
      pause: (_ms, signal) =>
        new Promise<void>((_resolve, reject) => {
          typing.resolve();
          signal?.addEventListener("abort", () => reject(signal.reason));
        }),
    });

    replies.start(message);
    await typing.promise;
    replies.cancel("r1", "Shutting down");
    for (let i = 0; i < 100 && sent.length === 0; i++) await Bun.sleep(10);

    expect(sent).toEqual([{ type: "bot.end", replyId: "r1", error: "Shutting down" }]);
    expect(replies.has("bot-1")).toBe(false);
  });

  test("it knows which bots are answering, so their computers are not released from under them", async () => {
    const gate = Promise.withResolvers<void>();
    const run = harness(() => ({
      generate: async () => {
        await gate.promise;
        return { type: "response" } as never;
      },
    }));

    run.replies.start(message);
    await Bun.sleep(20);
    expect(run.replies.has("bot-1")).toBe(true);
    expect(run.replies.has("bot-2")).toBe(false);

    gate.resolve();
    await run.until();
    expect(run.replies.has("bot-1")).toBe(false);
  });

  test("a message that cannot be sent because the link is down ends the reply: the bot is not left to try again", async () => {
    const run = harness(
      agentThat(
        [toolCall("send_message", { text: "one" })],
        [toolCall("send_message", { text: "two" })],
        [text("")],
      ),
      { linkUp: () => false },
    );

    run.replies.start(message);
    for (let i = 0; i < 100 && run.replies.has("bot-1"); i++) await Bun.sleep(10);

    // Nothing reached the control plane, and the second message was never tried.
    expect(run.sent).toEqual([]);
    expect(run.pauses).toHaveLength(1);
    expect(run.finished).toEqual(["bot-1"]);
  });

  test("when the connection drops every reply is aborted", async () => {
    const started = Promise.withResolvers<void>();
    const run = harness(() => ({
      generate: async ({ abortSignal }) => {
        started.resolve();
        await new Promise((_resolve, reject) =>
          abortSignal?.addEventListener("abort", () => reject(abortSignal.reason)),
        );
        return { type: "response" } as never;
      },
    }));

    run.replies.start(message);
    await started.promise;
    run.replies.abortAll("The connection to the control plane dropped");
    await run.until();

    expect(run.sent).toEqual([
      { type: "bot.end", replyId: "r1", error: "The connection to the control plane dropped" },
    ]);
  });
});
