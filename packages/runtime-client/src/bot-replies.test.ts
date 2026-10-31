import { describe, expect, test } from "bun:test";
import { Agent, createTool, type AnyTool } from "@anvia/core";
import { scriptedModel, text, toolCall } from "@aven/agents/testing/scripted-model";
import { createSendMessageTool } from "@aven/agents/tools/send-message";
import type { RuntimeToControlPlane } from "@aven/protocol/runtime-wire";
import { z } from "zod";

import { BotReplies, type BotReplyMessage, type CreateBotReplyAgent } from "./bot-replies";
import type { ThreadSandbox, ThreadWorkspaces } from "./sandbox";

const tool = (name: string): AnyTool =>
  createTool({ name, description: name, inputSchema: z.object({}), execute: async () => "ok" });

const model = { provider: "openai", gatewayPath: "/g", gatewayToken: "t" } as const;
const message: BotReplyMessage = {
  type: "bot.reply",
  replyId: "r1",
  bot: { id: "bot-1", name: "Pip", instruction: "" },
  prompt: "hello",
  model,
};

// An agent that sends what a script says to, then stops.
const agentThat =
  (...steps: Parameters<typeof scriptedModel>[0]): CreateBotReplyAgent =>
  ({ deliver, computer, memory }) =>
    new Agent({
      id: "bot",
      model: scriptedModel(steps),
      instructions: "x",
      memory,
      tools: [createSendMessageTool(deliver), ...computer],
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
