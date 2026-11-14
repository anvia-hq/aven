import { Agent } from "@anvia/core";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { scriptedModel, text, toolCall } from "@aven/agents/testing/scripted-model";
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import * as z from "zod/v4";

import { DurableRuns } from "./durable-runs";

import { connectMcpServers, mcpPrefix } from "./mcp-servers";
import { journalPath } from "@aven/agent-backend/testing/journal-path";
import type { RunEvent, RunMcpServer } from "@aven/protocol/types";

const seen: { authorization: string | null; note: string }[] = [];
const handler = createMcpHandler(({ requestInfo }) => {
  const server = new McpServer({ name: "notes", version: "1.0.0" });
  server.registerTool(
    "add-note",
    { description: "Save a note", inputSchema: z.object({ text: z.string() }) },
    async ({ text: note }) => {
      seen.push({ authorization: requestInfo?.headers.get("authorization") ?? null, note });
      return { content: [{ type: "text", text: `Saved: ${note}` }] };
    },
  );
  return server;
});
const http = Bun.serve({ port: 0, fetch: (request) => handler.fetch(request) });
afterAll(() => http.stop(true));

const notes = (changes: Partial<RunMcpServer> = {}): RunMcpServer => ({
  id: "11111111-1111-4111-8111-111111111111",
  name: "Team Notes",
  url: `http://localhost:${http.port}/`,
  headers: { authorization: "Bearer secret-token" },
  allowLocal: true,
  ...changes,
});

describe("connectMcpServers", () => {
  const open: { close(): Promise<void> }[] = [];
  afterEach(async () => {
    for (const item of open.splice(0)) await item.close();
  });

  test("names the tools after the server and sends the headers", async () => {
    const connected = await connectMcpServers([notes()]);
    open.push(connected);
    expect(connected.results).toEqual([{ id: "11111111-1111-4111-8111-111111111111" }]);
    expect(connected.note).toEqual({ servers: [{ name: "Team Notes", tools: 1 }], failed: [] });
    expect(connected.tools.map((tool) => tool.name)).toEqual(["team_notes_add-note"]);
    expect(mcpPrefix("Team Notes")).toBe("team_notes_");
  });

  test("two servers whose tools would share a name: the second is refused, and the first keeps its tool", async () => {
    const otherHandler = createMcpHandler(() => {
      const server = new McpServer({ name: "other", version: "1.0.0" });
      server.registerTool(
        "notes_add-note",
        { description: "Other add", inputSchema: z.object({ text: z.string() }) },
        async ({ text: note }) => ({ content: [{ type: "text", text: `other ${note}` }] }),
      );
      return server;
    });
    const other = Bun.serve({ port: 0, fetch: (request) => otherHandler.fetch(request) });
    afterAll(() => other.stop(true));
    const connected = await connectMcpServers([
      notes({
        name: "Team",
        id: "33333333-3333-4333-8333-333333333333",
        url: `http://localhost:${other.port}/`,
      }),
      notes({ name: "Team Notes", id: "44444444-4444-4444-8444-444444444444" }),
    ]);
    open.push(connected);
    expect(connected.tools.map((tool) => tool.name)).toEqual(["team_notes_add-note"]);
    expect(connected.note.failed.map((failure) => failure.name)).toEqual(["Team Notes"]);
    expect(connected.note.failed[0]?.reason).toContain("team_notes_add-note");
    expect(connected.results.find((result) => result.id.startsWith("4444"))?.error).toBeTruthy();
    expect(connected.results.find((result) => result.id.startsWith("3333"))).toEqual({
      id: "33333333-3333-4333-8333-333333333333",
    });
  });

  test("a server that is down is reported and the others still connect", async () => {
    const connected = await connectMcpServers([
      notes(),
      notes({
        id: "22222222-2222-4222-8222-222222222222",
        name: "Gone",
        url: "http://localhost:1/",
      }),
    ]);
    open.push(connected);
    expect(connected.tools.map((tool) => tool.name)).toEqual(["team_notes_add-note"]);
    expect(connected.note.failed.map((failure) => failure.name)).toEqual(["Gone"]);
    const gone = connected.results.find((result) => result.id.startsWith("2222"));
    expect(gone?.error).toBeTruthy();
    expect(connected.note.failed[0]?.reason).toBe(gone?.error ?? "");
  });

  test("a server on this machine is refused unless the person allowed it", async () => {
    const connected = await connectMcpServers([notes({ allowLocal: false })]);
    open.push(connected);
    expect(connected.tools).toEqual([]);
    expect(connected.note.failed.map((failure) => failure.name)).toEqual(["Team Notes"]);
  });

  test("a name that leads to this machine is refused before anything is sent to it", async () => {
    const before = seen.length;
    const connected = await connectMcpServers(
      [notes({ allowLocal: false, url: "https://internal.example.com/mcp" })],
      { resolve: async () => ["127.0.0.1"] },
    );
    open.push(connected);
    expect(connected.tools).toEqual([]);
    expect(connected.results[0]?.error).toContain("private network");
    expect(seen.length).toBe(before);

    const allowed = await connectMcpServers([notes()], { resolve: async () => ["127.0.0.1"] });
    open.push(allowed);
    expect(allowed.tools).toHaveLength(1);
  });

  test("a durable run calls the server's tool, as a plain local tool of the agent", async () => {
    const connected = await connectMcpServers([notes()]);
    open.push(connected);
    const runs = await DurableRuns.open(journalPath());
    open.push(runs);
    const agent = new Agent({
      id: "run-1",
      instructions: "x",
      tools: connected.tools,
      model: scriptedModel([
        [toolCall("team_notes_add-note", { text: "ship friday" })],
        [text("Saved it.")],
      ]),
    });
    const events: RunEvent[] = [];
    const run = await runs.start("run-1", "thread-1", "note it", { agent }, (event) =>
      events.push(event),
    );
    expect(await run.done).toMatchObject({ type: "response" });
    expect(seen.at(-1)).toEqual({ authorization: "Bearer secret-token", note: "ship friday" });
    expect(events).toContainEqual({ type: "text", delta: "Saved it." });
    expect(JSON.stringify(events)).toContain("Saved: ship friday");
  });
});
