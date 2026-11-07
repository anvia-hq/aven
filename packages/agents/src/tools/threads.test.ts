import { describe, expect, test } from "bun:test";
import type { BotThreadView } from "@aven/protocol/threads";

import {
  ARCHIVE_THREAD_TOOL_NAME,
  CONTINUE_THREAD_TOOL_NAME,
  createThreadTools,
  GET_THREAD_TOOL_NAME,
  LIST_PROJECTS_TOOL_NAME,
  LIST_THREADS_TOOL_NAME,
  START_THREAD_TOOL_NAME,
  STOP_THREAD_TOOL_NAME,
  type ThreadsHost,
} from "./threads";

const ID = "11111111-2222-4333-8444-555555555555";
const PROJECT = "66666666-7777-4888-8999-000000000000";
const thread: BotThreadView = {
  id: ID,
  title: "Fix the build",
  projectId: PROJECT,
  repository: "acme/app",
  state: "open",
  mine: true,
  running: true,
  awaitingAnswer: false,
  pullRequests: [],
  updatedAt: "2026-11-02T00:00:00.000Z",
};

function host() {
  const calls: unknown[] = [];
  const hosted: ThreadsHost = {
    projects: async () => (calls.push(["projects"]), []),
    list: async (filter) => (calls.push(["list", filter]), [thread]),
    get: async (id) => (calls.push(["get", id]), { ...thread, turns: [], earlier: 0 }),
    start: async (input) => (calls.push(["start", input]), thread),
    continue: async (id, input) => (calls.push(["continue", id, input]), thread),
    archive: async (id, archived) => (calls.push(["archive", id, archived]), thread),
    stop: async (id) => (calls.push(["stop", id]), { ...thread, running: false }),
  };
  const tools = createThreadTools(hosted);
  const by = (name: string) =>
    tools.find((tool) => tool.name === name) as unknown as {
      call(input: Record<string, unknown>): Promise<unknown>;
    };
  return { calls, tools, by };
}

describe("the thread tools", () => {
  test("are seven, named for what they do", () => {
    expect(host().tools.map((tool) => tool.name)).toEqual([
      LIST_PROJECTS_TOOL_NAME,
      LIST_THREADS_TOOL_NAME,
      GET_THREAD_TOOL_NAME,
      START_THREAD_TOOL_NAME,
      CONTINUE_THREAD_TOOL_NAME,
      ARCHIVE_THREAD_TOOL_NAME,
      STOP_THREAD_TOOL_NAME,
    ]);
  });

  test("stopping hands the host the thread's id and gives the thread back", async () => {
    const { calls, by } = host();
    const result = (await by(STOP_THREAD_TOOL_NAME).call({ id: ID })) as { thread: BotThreadView };
    expect(calls).toEqual([["stop", ID]]);
    expect(result.thread.running).toBe(false);
  });

  test("starting hands the host the project, the prompt and the model chosen, and says where to find the thread", async () => {
    const { calls, by } = host();
    const result = (await by(START_THREAD_TOOL_NAME).call({
      projectId: PROJECT,
      prompt: "  Fix the build  ",
      modelId: "gpt-5",
      createdBy: "someone-else",
    })) as { thread: BotThreadView; note: string };
    expect(calls).toEqual([
      ["start", { projectId: PROJECT, prompt: "Fix the build", modelId: "gpt-5" }],
    ]);
    expect(result.thread).toEqual(thread);
    expect(result.note).toContain("Threads list");
  });

  test("continuing splits the thread's id from the message", async () => {
    const { calls, by } = host();
    await by(CONTINUE_THREAD_TOOL_NAME).call({ id: ID, prompt: "Also the lint" });
    expect(calls).toEqual([["continue", ID, { prompt: "Also the lint" }]]);
  });

  test("archiving archives unless it is told to bring a thread back", async () => {
    const { calls, by } = host();
    await by(ARCHIVE_THREAD_TOOL_NAME).call({ id: ID });
    await by(ARCHIVE_THREAD_TOOL_NAME).call({ id: ID, archived: false });
    expect(calls).toEqual([
      ["archive", ID, true],
      ["archive", ID, false],
    ]);
  });

  test("listing takes a project and whether to list the archived, and getting takes an id", async () => {
    const { calls, by } = host();
    expect(await by(LIST_THREADS_TOOL_NAME).call({ projectId: PROJECT, archived: true })).toEqual({
      threads: [thread],
    });
    await by(GET_THREAD_TOOL_NAME).call({ id: ID });
    await by(LIST_PROJECTS_TOOL_NAME).call({});
    expect(calls).toEqual([
      ["list", { projectId: PROJECT, archived: true }],
      ["get", ID],
      ["projects"],
    ]);
  });

  test("an id that is not an id, an empty or huge prompt, or a missing project is refused before the host is asked", async () => {
    const { calls, by } = host();
    await expect(by(GET_THREAD_TOOL_NAME).call({ id: "latest" })).rejects.toThrow();
    await expect(
      by(START_THREAD_TOOL_NAME).call({ projectId: PROJECT, prompt: "  " }),
    ).rejects.toThrow();
    await expect(
      by(START_THREAD_TOOL_NAME).call({ projectId: PROJECT, prompt: "x".repeat(20_001) }),
    ).rejects.toThrow();
    await expect(by(START_THREAD_TOOL_NAME).call({ prompt: "Do it" })).rejects.toThrow();
    await expect(by(CONTINUE_THREAD_TOOL_NAME).call({ id: ID })).rejects.toThrow();
    expect(calls).toEqual([]);
  });
});
