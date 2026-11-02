import { Agent, createQuestionTool } from "@anvia/core";
import type { McpNote } from "@aven/agents/mcp";
import { scriptedModel, text, toolCall } from "@aven/agents/testing/scripted-model";
import type { RunMcpServer } from "@aven/protocol/runtime-wire";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import * as z from "zod/v4";

import type { CreateRuntimeAgent } from "./run-driver";
import { startRuntime } from "./runner";
import type { ThreadSandbox, ThreadWorkspaces } from "./sandbox";
import { fakeControlPlane } from "./testing/fake-control-plane";
import { journalPath } from "./testing/journal-path";
import { noProcesses } from "./thread-processes";

// A sandbox that is up at once with no tools: what is asked here is about MCP, not the sandbox.
const sandbox: ThreadWorkspaces = {
  async acquire(): Promise<ThreadSandbox> {
    return { tools: [], hasRunningProcesses: async () => false, processes: noProcesses };
  },
  desktop: () => undefined,
  workspace: async () => undefined,
  async release() {},
  async dispose() {},
};

const thread = { id: "thread-1", organizationId: "org-1" };
const runStart = { type: "run.start", runId: "run-1", thread, prompt: "hi" };

const until = async (condition: () => boolean) => {
  for (let i = 0; i < 100 && !condition(); i++) await Bun.sleep(20);
  expect(condition()).toBe(true);
};

const cleanups: (() => unknown)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

function connect(createAgent: CreateRuntimeAgent) {
  const plane = fakeControlPlane();
  const runtime = startRuntime({
    url: plane.url,
    token: "t",
    journalPath: journalPath(),
    sandbox,
    createAgent,
  });
  cleanups.push(() => runtime.stop(), plane.stop);
  return { plane, runtime };
}

const ended = (plane: ReturnType<typeof fakeControlPlane>) =>
  plane.received.filter((message) => message.type === "run.end");
const reports = (plane: ReturnType<typeof fakeControlPlane>) =>
  plane.received.flatMap((message) =>
    message.type === "call" && message.method === "mcp.report"
      ? [message.params as { runId: string; results: { id: string; error?: string }[] }]
      : [],
  );

// The person's MCP servers (decision 0085), through a runner: a real MCP server over HTTP that
// writes down what it was sent, and the runs that come with it.
describe("a run with the person's MCP servers", () => {
  const calls: { authorization: string | null; note: string }[] = [];
  const handler = createMcpHandler(({ requestInfo }) => {
    const server = new McpServer({ name: "notes", version: "1.0.0" });
    server.registerTool(
      "add-note",
      { description: "Save a note", inputSchema: z.object({ text: z.string() }) },
      async ({ text: note }) => {
        calls.push({ authorization: requestInfo?.headers.get("authorization") ?? null, note });
        return { content: [{ type: "text", text: `Saved: ${note}` }] };
      },
    );
    return server;
  });
  const http = Bun.serve({ port: 0, fetch: (request) => handler.fetch(request) });
  afterAll(() => http.stop(true));

  const serverId = "11111111-1111-4111-8111-111111111111";
  const mcp = (changes: Partial<RunMcpServer> = {}): RunMcpServer[] => [
    {
      id: serverId,
      name: "Team Notes",
      url: `http://localhost:${http.port}/`,
      headers: { authorization: "Bearer secret-token" },
      allowLocal: true,
      ...changes,
    },
  ];

  test("the agent calls a server's tool, which is named after it, and the control plane is told it connected", async () => {
    const told: (McpNote | undefined)[] = [];
    const { plane, runtime } = connect(({ id, tools, mcp: note }) => {
      told.push(note);
      return {
        agent: new Agent({
          id,
          instructions: "x",
          tools: [...tools],
          model: scriptedModel([
            [toolCall("team_notes_add-note", { text: "ship friday" })],
            [text("Saved it.")],
          ]),
        }),
      };
    });
    await runtime.ready;
    plane.send({ ...runStart, mcp: mcp() });

    await until(() => ended(plane).length === 1);
    expect(ended(plane)[0]).toMatchObject({ outcome: "response" });
    // The server got the header and the call; the agent heard the answer.
    expect(calls.at(-1)).toEqual({ authorization: "Bearer secret-token", note: "ship friday" });
    expect(JSON.stringify(plane.received)).toContain("Saved: ship friday");
    expect(told[0]).toEqual({ servers: [{ name: "Team Notes", tools: 1 }], failed: [] });
    expect(reports(plane)).toEqual([{ runId: "run-1", results: [{ id: serverId }] }]);
    // The header's value is a secret of the person's: it is not in anything sent home.
    expect(JSON.stringify(plane.received)).not.toContain("secret-token");
  });

  test("a server that is down is reported and the run goes on without it", async () => {
    const told: (McpNote | undefined)[] = [];
    const { plane, runtime } = connect(({ id, mcp: note }) => {
      told.push(note);
      return {
        agent: new Agent({ id, model: scriptedModel([[text("ok")]]), instructions: "x" }),
      };
    });
    await runtime.ready;
    plane.send({ ...runStart, mcp: mcp({ url: "http://localhost:1/" }) });

    await until(() => ended(plane).length === 1);
    expect(ended(plane)[0]).toMatchObject({ outcome: "response" });
    expect(reports(plane)[0]?.results).toEqual([{ id: serverId, error: expect.any(String) }]);
    expect(told[0]?.failed.map((failure) => failure.name)).toEqual(["Team Notes"]);
  });

  test("an agent that waited for an answer calls the server through the connection of the run that answers", async () => {
    const { plane, runtime } = connect(({ id, tools }) => ({
      agent: new Agent({
        id,
        instructions: "x",
        tools: [createQuestionTool(), ...tools],
        // One agent for the whole exchange: the run that answers continues the asking run's.
        model: scriptedModel([
          [
            {
              type: "tool-call",
              toolCallId: "q1",
              toolName: "ask_user",
              input: { questions: [{ id: "note", text: "What should I save?" }] },
            },
          ],
          [toolCall("team_notes_add-note", { text: "after the question" })],
          [text("Saved it.")],
        ]),
      }),
    }));
    await runtime.ready;
    plane.send({ ...runStart, mcp: mcp() });
    await until(() => ended(plane).length === 1);
    const asked = ended(plane)[0];
    expect(asked).toMatchObject({ outcome: "interaction" });
    const continuation = asked && "continuation" in asked ? asked.continuation : undefined;
    const before = calls.length;

    // The asking run's connection ended with it; the answering run brings its own.
    plane.send({
      type: "run.resume",
      runId: "run-2",
      thread,
      continuation,
      response: { type: "tool-question", answers: [{ questionId: "note", value: "anything" }] },
      mcp: mcp(),
    });
    await until(() => ended(plane).length === 2);
    expect(ended(plane)[1]).toMatchObject({ runId: "run-2", outcome: "response" });
    expect(calls.slice(before)).toEqual([
      { authorization: "Bearer secret-token", note: "after the question" },
    ]);
    expect(reports(plane).map((report) => report.runId)).toEqual(["run-1", "run-2"]);
  });
});
