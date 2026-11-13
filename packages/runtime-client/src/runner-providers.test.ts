import { Agent, type AnyTool } from "@anvia/core";
import { createProviderTools } from "@aven/agents/tools/providers";
import { createSendMessageTool } from "@aven/agents/tools/send-message";
import { scriptedModel, text, toolCall } from "@aven/agents/testing/scripted-model";
import { afterEach, describe, expect, test } from "bun:test";

import { startRuntime } from "./runner";
import { fakeControlPlane } from "./testing/fake-control-plane";
import { journalPath } from "@aven/agent-backend/testing/journal-path";
import { noProcesses } from "./thread-processes";
import type {
  CreateBotReplyAgent,
  CreateRuntimeAgent,
  FakeControlPlaneOptions,
  ThreadSandbox,
  ThreadWorkspaces,
} from "./types";

const sandbox: ThreadWorkspaces = {
  async acquire(): Promise<ThreadSandbox> {
    return { tools: [], hasRunningProcesses: async () => false, processes: noProcesses };
  },
  workspace: async () => undefined,
  async release() {},
  async dispose() {},
};

const until = async (condition: () => boolean) => {
  for (let i = 0; i < 100 && !condition(); i++) await Bun.sleep(20);
  expect(condition()).toBe(true);
};

const cleanups: (() => unknown)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

function connect(createBotAgent: CreateBotReplyAgent, answer: FakeControlPlaneOptions["answer"]) {
  const createAgent: CreateRuntimeAgent = () => ({
    agent: new Agent({ id: "x", instructions: "x", model: scriptedModel([]) }),
  });
  const plane = fakeControlPlane({ answer });
  const runtime = startRuntime({
    url: plane.url,
    token: "t",
    journalPath: journalPath(),
    sandbox,
    createAgent,
    createBotAgent,
  });
  cleanups.push(() => runtime.stop(), plane.stop);
  return { plane, runtime };
}

const providerId = "44444444-4444-4444-8444-444444444444";
const view = {
  id: providerId,
  kind: "azure",
  name: "Work Azure",
  baseUrl: "https://work.openai.azure.com",
  modelId: "gpt-5",
  isDefault: false,
  hasKey: false,
};
const botReply = {
  type: "bot.reply",
  replyId: "reply-1",
  bot: {
    id: "bot-1",
    name: "Pip",
    handle: "main",
    instruction: "",
    description: "",
    canCreateBots: true,
    peers: [],
    timezone: "UTC",
  },
  prompt: "set up my azure",
  model: { provider: "openai", gatewayPath: "/g", gatewayToken: "t" },
};

const providerCalls = (plane: ReturnType<typeof fakeControlPlane>) =>
  plane.received.flatMap((message) =>
    message.type === "call" && message.method === "bot.provider"
      ? [message.params as { op: string } & Record<string, unknown>]
      : [],
  );
const done = (plane: ReturnType<typeof fakeControlPlane>) =>
  plane.received.some((message) => message.type === "bot.end");

const toolsOf = (steps: Parameters<typeof scriptedModel>[0], seen?: string[][]) =>
  (({ send, memory, providers }) => {
    const tools: AnyTool[] = [createSendMessageTool(send), ...createProviderTools(providers)];
    seen?.push(tools.map((tool) => tool.name));
    return new Agent({ id: "bot", instructions: "x", memory, model: scriptedModel(steps), tools });
  }) satisfies CreateBotReplyAgent;

const answerProvider: FakeControlPlaneOptions["answer"] = (message) => {
  if (message.method !== "bot.provider") return undefined;

  const { op } = message.params as { op: string };

  if (op === "remove") return null;

  if (op === "list") return [view];

  if (op === "models") return { models: ["gpt-5", "gpt-5-mini"] };

  if (op === "askKey") return { providerId, name: view.name };

  return view;
};

describe("a bot's reply with the person's providers (decision 0086)", () => {
  test("the bot keeps the providers through calls to the control plane, and no key is in any of them", async () => {
    const { plane, runtime } = connect(
      toolsOf([
        [
          toolCall("add_provider", {
            kind: "azure",
            name: "Work Azure",
            baseUrl: "https://work.openai.azure.com",
            modelId: "gpt-5",
          }),
        ],
        [toolCall("ask_provider_key", { id: providerId })],
        [toolCall("list_provider_models", { id: providerId })],
        [toolCall("update_provider", { id: providerId, modelId: "gpt-5-mini", isDefault: true })],
        [toolCall("remove_provider", { id: providerId })],
        [toolCall("send_message", { text: "Done" })],
        [text("")],
      ]),
      answerProvider,
    );
    await runtime.ready;
    plane.send(botReply);

    await until(() => done(plane));
    expect(providerCalls(plane)).toEqual([
      {
        replyId: "reply-1",
        op: "add",
        kind: "azure",
        name: "Work Azure",
        baseUrl: "https://work.openai.azure.com",
        modelId: "gpt-5",
      },
      { replyId: "reply-1", op: "askKey", id: providerId },
      { replyId: "reply-1", op: "models", id: providerId },
      {
        replyId: "reply-1",
        op: "update",
        id: providerId,
        modelId: "gpt-5-mini",
        isDefault: true,
      },
      { replyId: "reply-1", op: "remove", id: providerId },
    ]);
  });

  test("the bot can ask for a key when the person is there, and cannot for a note or a bot's message", async () => {
    const seen: string[][] = [];
    const { plane, runtime } = connect(
      toolsOf([[toolCall("send_message", { text: "Hi" })], [text("")]], seen),
      answerProvider,
    );
    await runtime.ready;
    const reply = (replyId: string, prompt: string, handle: string) =>
      plane.send({ ...botReply, replyId, prompt, bot: { ...botReply.bot, handle } });

    reply("person", "hello", "pip");
    await until(() => seen.length === 1);
    reply("note", "[note] Scheduled task is due", "pip");
    await until(() => seen.length === 2);
    reply("bot", "[from scout] help", "pip");
    await until(() => seen.length === 3);
    reply("main", "[from scout] help", "main");
    await until(() => seen.length === 4);

    expect(seen.map((tools) => tools.includes("ask_provider_key"))).toEqual([
      true,
      false,
      false,
      true,
    ]);
    for (const tools of seen) expect(tools).toContain("add_provider");
  });
});

describe("what a bot is doing while it replies (decision 0267)", () => {
  test("is sent as the label changes, once for each change, and only for the reply asked for", async () => {
    const { plane, runtime } = connect(({ send, memory, onActivity }) => {
      onActivity?.("Thinking");
      onActivity?.("Thinking");
      onActivity?.("Reading app.ts");
      onActivity?.(null);
      return new Agent({
        id: "bot",
        instructions: "x",
        memory,
        model: scriptedModel([[toolCall("send_message", { text: "Done" })], [text("")]]),
        tools: [createSendMessageTool(send)],
      });
    }, answerProvider);
    await runtime.ready;
    plane.send(botReply);

    await until(() => done(plane));
    expect(
      plane.received.flatMap((message) =>
        message.type === "bot.activity" ? [[message.replyId, message.label]] : [],
      ),
    ).toEqual([
      ["reply-1", "Thinking"],
      ["reply-1", "Reading app.ts"],
      ["reply-1", null],
    ]);
  });
});
