import { Agent, type AnyTool } from "@anvia/core";
import { createThreadTools } from "@aven/agents/tools/threads";
import { createSendMessageTool } from "@aven/agents/tools/send-message";
import { scriptedModel, text, toolCall } from "@aven/agents/testing/scripted-model";
import { afterEach, describe, expect, test } from "bun:test";

import { startRuntime } from "./runner";
import { fakeControlPlane } from "./testing/fake-control-plane";
import { journalPath } from "./testing/journal-path";
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

const id = "55555555-5555-4555-8555-555555555555";
const projectId = "66666666-6666-4666-8666-666666666666";
const thread = {
  id,
  title: "Fix the build",
  projectId,
  repository: "acme/app",
  state: "open",
  mine: true,
  running: true,
  awaitingAnswer: false,
  pullRequests: [],
  updatedAt: "2026-11-02T00:00:00.000Z",
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
  prompt: "fix the build in acme/app",
  model: { provider: "openai", gatewayPath: "/g", gatewayToken: "t" },
};

const threadCalls = (plane: ReturnType<typeof fakeControlPlane>) =>
  plane.received.flatMap((message) =>
    message.type === "call" && message.method === "bot.thread"
      ? [message.params as { op: string } & Record<string, unknown>]
      : [],
  );
const done = (plane: ReturnType<typeof fakeControlPlane>) =>
  plane.received.some((message) => message.type === "bot.end");

const toolsOf = (steps: Parameters<typeof scriptedModel>[0], results?: unknown[]) =>
  (({ send, memory, threads }) => {
    const tools: AnyTool[] = [createSendMessageTool(send), ...createThreadTools(threads)];
    return new Agent({
      id: "bot",
      instructions: "x",
      memory,
      model: scriptedModel(steps),
      tools: results ? tools.map((tool) => watched(tool, results)) : tools,
    });
  }) satisfies CreateBotReplyAgent;

const watched = (tool: AnyTool, results: unknown[]): AnyTool =>
  ({
    ...tool,
    call: async (input: unknown) => {
      const result = await (tool as unknown as { call(input: unknown): Promise<unknown> }).call(
        input,
      );
      results.push(result);
      return result;
    },
  }) as unknown as AnyTool;

const answerThread: FakeControlPlaneOptions["answer"] = (message) => {
  if (message.method !== "bot.thread") return undefined;
  const { op } = message.params as { op: string };
  if (op === "projects")
    return [{ id: projectId, name: "app", repository: "acme/app", defaultBranch: "main" }];
  if (op === "list") return [thread];
  if (op === "get") return { ...thread, turns: [], earlier: 0 };
  return thread;
};

describe("a bot's reply with the person's threads (decision 0088)", () => {
  test("the bot works the threads through calls to the control plane, with what the model chose and nothing else", async () => {
    const { plane, runtime } = connect(
      toolsOf([
        [toolCall("list_projects", {})],
        [toolCall("list_threads", { projectId, archived: false })],
        [toolCall("get_thread", { id })],
        [
          toolCall("start_thread", {
            projectId,
            prompt: "Fix the build",
            title: "Build",
            modelId: "gpt-5",
          }),
        ],
        [toolCall("continue_thread", { id, prompt: "Also the lint" })],
        [toolCall("archive_thread", { id })],
        [toolCall("archive_thread", { id, archived: false })],
        [toolCall("stop_thread", { id })],
        [toolCall("send_message", { text: "Done" })],
        [text("")],
      ]),
      answerThread,
    );
    await runtime.ready;
    plane.send(botReply);

    await until(() => done(plane));
    expect(threadCalls(plane)).toEqual([
      { replyId: "reply-1", op: "projects" },
      { replyId: "reply-1", op: "list", projectId, archived: false },
      { replyId: "reply-1", op: "get", id },
      {
        replyId: "reply-1",
        op: "start",
        projectId,
        prompt: "Fix the build",
        title: "Build",
        modelId: "gpt-5",
      },
      { replyId: "reply-1", op: "continue", id, prompt: "Also the lint" },
      { replyId: "reply-1", op: "archive", id, archived: true },
      { replyId: "reply-1", op: "archive", id, archived: false },
      { replyId: "reply-1", op: "stop", id },
    ]);
  });

  test("what the control plane answers is what the model reads", async () => {
    const results: unknown[] = [];
    const { plane, runtime } = connect(
      toolsOf(
        [
          [toolCall("start_thread", { projectId, prompt: "Fix the build" })],
          [toolCall("send_message", { text: "Started" })],
          [text("")],
        ],
        results,
      ),
      answerThread,
    );
    await runtime.ready;
    plane.send(botReply);

    await until(() => done(plane));
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ thread, note: expect.stringContaining("Threads list") });
  });
});
