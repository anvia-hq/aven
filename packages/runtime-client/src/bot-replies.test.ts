import { describe, expect, test } from "bun:test";
import { Agent, createTool, type AnyTool } from "@anvia/core";
import { scriptedModel, text, toolCall } from "@aven/agents/testing/scripted-model";
import { createCreateBotTool, type CreateBot } from "@aven/agents/tools/create-bot";
import { createSendMessageTool } from "@aven/agents/tools/send-message";
import { createUpdateSelfTool } from "@aven/agents/tools/update-self";
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
  bot: {
    id: "bot-1",
    name: "Pip",
    handle: "pip",
    instruction: "",
    description: "A pal.",
    canCreateBots: false,
    peers: [],
    timezone: "Asia/Jakarta",
  },
  prompt: "hello",
  model,
};

const makingBots = (createBot?: CreateBot) => (createBot ? [createCreateBotTool(createBot)] : []);

// An agent that sends what a script says to, then stops.
const agentThat =
  (...steps: Parameters<typeof scriptedModel>[0]): CreateBotReplyAgent =>
  ({ send, computer, memory, createBot, updateSelf }) =>
    new Agent({
      id: "bot",
      model: scriptedModel(steps),
      instructions: "x",
      memory,
      tools: [
        createSendMessageTool(send),
        ...computer,
        ...makingBots(createBot),
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

function harness(
  createAgent: CreateBotReplyAgent,
  options: { linkUp?: () => boolean; failSend?: boolean } = {},
) {
  const sent: RuntimeToControlPlane[] = [];
  const calls: unknown[] = [];
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
    call: async (method, params) => {
      calls.push({ method, params });
      if (method === "bot.create") {
        const { name } = params as { name: string };
        return { id: "b2", name, handle: name.toLowerCase() };
      }
      if (method === "bot.send") {
        if (options.failSend) throw new Error('No bot with the handle "ghost"');
        return { handle: "scout", name: "Scout" };
      }
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
  return { replies, sent, calls, acquired, finished, pauses, boxes, until };
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

  test("a bot writes to another by asking the control plane, for its own reply, and what it writes to the person is typed", async () => {
    const run = harness(
      agentThat(
        [
          toolCall("send_message", { to: "scout", text: "do A" }),
          toolCall("send_message", { text: "I asked Scout" }),
        ],
        [text("")],
      ),
    );

    run.replies.start({
      ...message,
      bot: { ...message.bot, peers: [{ handle: "scout", name: "Scout", description: "" }] },
    });
    await run.until();

    expect(run.calls).toContainEqual({
      method: "bot.send",
      params: { replyId: "r1", to: "scout", text: "do A" },
    });
    // Only what goes to the person is shown, and only that is typed.
    expect(run.sent).toEqual([
      { type: "bot.say", replyId: "r1", text: "I asked Scout" },
      { type: "bot.end", replyId: "r1" },
    ]);
    expect(run.pauses).toHaveLength(1);
  });

  test("a refusal of the control plane to carry a message to a bot reaches the bot as the tool's error", async () => {
    const run = harness(
      ({ send, memory }) => ({
        generate: async () => {
          await memory.store.load({ scope: { sessionId: "bot-1" } });
          const refused = await send({ to: "ghost", text: "hi" }, {}).catch(
            (error: Error) => error.message,
          );
          await send({ to: "user", text: refused }, {});
          return { type: "response" } as never;
        },
      }),
      { failSend: true },
    );

    run.replies.start(message);
    await run.until();

    expect(run.sent).toContainEqual({
      type: "bot.say",
      replyId: "r1",
      text: 'No bot with the handle "ghost"',
    });
  });

  test("a bot the main bot makes is on the list of bots it may write to, from then on in the reply", async () => {
    let peers: readonly unknown[] = [];
    const run = harness((input) => {
      peers = input.peers;
      return agentThat(
        [
          toolCall("create_bot", {
            name: "Scout",
            instruction: "You research.",
            description: "Looks.",
          }),
        ],
        [text("")],
      )(input);
    });

    run.replies.start({ ...message, bot: { ...message.bot, canCreateBots: true } });
    await run.until();

    expect(peers).toEqual([{ handle: "scout", name: "Scout", description: "Looks." }]);
  });

  test("a bot asks the person through the control plane, unless a note woke it, when nobody is there", async () => {
    const asked: unknown[] = [];
    const run = harness((input) => {
      asked.push(input.askQuestion);
      return agentThat([text("")])(input);
    });
    run.replies.start(message);
    await run.until();
    expect(typeof asked[0]).toBe("function");

    const noted = harness((input) => {
      asked.push(input.askQuestion);
      return agentThat([text("")])(input);
    });
    noted.replies.start({ ...message, prompt: "[note] Say hello." });
    await noted.until();
    expect(asked[1]).toBeUndefined();
  });

  test("a bot's schedules are asked of the control plane, for its own reply, and its timezone is the person's", async () => {
    let timezone: string | undefined;
    const view = { id: "s1", bot: "pip", name: "News", cron: "0 7 * * *" };
    const run = harness((input) => {
      timezone = input.bot.timezone;
      return {
        generate: async () => {
          await input.schedules.list();
          await input.schedules.create({ name: "News", cron: "0 7 * * *", prompt: "Read it." });
          await input.schedules.update("s1", { enabled: false });
          await input.schedules.remove("s1");
          return { type: "response" } as never;
        },
      };
    });

    run.replies.start(message);
    await run.until();

    expect(timezone).toBe("Asia/Jakarta");
    expect(
      run.calls.filter((call) => (call as { method: string }).method === "bot.schedule"),
    ).toEqual([
      { method: "bot.schedule", params: { replyId: "r1", op: "list" } },
      {
        method: "bot.schedule",
        params: {
          replyId: "r1",
          op: "create",
          name: "News",
          cron: "0 7 * * *",
          prompt: "Read it.",
        },
      },
      { method: "bot.schedule", params: { replyId: "r1", op: "update", id: "s1", enabled: false } },
      { method: "bot.schedule", params: { replyId: "r1", op: "delete", id: "s1" } },
    ]);
    expect(view.id).toBe("s1");
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
    const build = (canCreateBots: boolean, asking = false) =>
      defaultCreateBotAgent("http://control-plane")({
        bot: {
          ...message.bot,
          canCreateBots,
          handle: canCreateBots ? "main" : "pip",
          peers: [{ handle: "scout", name: "Scout", description: "Looks things up." }],
        },
        model: { provider: "openai", gatewayPath: "/g", gatewayToken: "t" },
        send: async () => "Sent",
        schedules: {
          list: async () => [],
          create: async () => {
            throw new Error("not made");
          },
          update: async () => {
            throw new Error("not changed");
          },
          remove: async () => undefined,
        },
        peers: [{ handle: "scout", name: "Scout", description: "Looks things up." }],
        memory: {
          store: {
            load: async () => [],
            append: async () => undefined,
            clear: async () => undefined,
          },
          savePolicy: "turn",
        },
        computer: [],
        askQuestion: asking ? async () => ({}) : undefined,
        updateSelf: async () => ({ name: "Pip", description: "" }),
        createBot: canCreateBots
          ? async () => ({ id: "b2", name: "Scout", handle: "scout" })
          : undefined,
      }) as unknown as { tools: { name: string }[]; instructions: string };

    test("a bot that is given a way to ask the person has the tool and is told when to use it, and one that is not has neither", () => {
      const ask = build(false, true);
      expect(ask.tools.map((each) => each.name)).toContain("ask_question");
      expect(ask.instructions).toContain("<questions>");
      const none = build(false);
      expect(none.tools.map((each) => each.name)).not.toContain("ask_question");
      expect(none.instructions).not.toContain("<questions>");
    });

    test("every bot can change itself and knows its own description", () => {
      const agent = build(false);
      expect(agent.tools.map((each) => each.name)).toEqual([
        "send_message",
        "list_bots",
        "create_schedule",
        "list_schedules",
        "update_schedule",
        "delete_schedule",
        "update_self",
      ]);
      expect(agent.instructions).toContain("Your description now: A pal.");
      expect(agent.instructions).not.toContain("<making-bots>");
    });

    test("the main bot can make bots too", () => {
      const agent = build(true);
      expect(agent.tools.map((each) => each.name)).toEqual([
        "send_message",
        "list_bots",
        "create_schedule",
        "list_schedules",
        "update_schedule",
        "delete_schedule",
        "create_bot",
        "update_self",
      ]);
      expect(agent.instructions).toContain("<making-bots>");
      expect(agent.instructions).toContain("- Scout (handle: scout): Looks things up.");
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
    const run = harness(({ memory, send }) => ({
      generate: async () => {
        await memory.store.load({ scope: { sessionId: "bot-1" } });
        await memory.store.append({
          scope: { sessionId: "bot-1" },
          runId: "x",
          turn: 1,
          messages: [],
        });
        await send({ to: "user", text: "hi" }, {});
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
