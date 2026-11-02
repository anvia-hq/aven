import { Agent } from "@anvia/core";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { scriptedModel, text, toolCall } from "@aven/agents/testing/scripted-model";
import type { RunEvent } from "@aven/protocol/events";
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import * as z from "zod/v4";

import { DurableRuns } from "./durable-runs";
import type { RunMcpServer } from "@aven/protocol/runtime-wire";

import { connectMcpServers, mcpPrefix } from "./mcp-servers";
import { journalPath } from "./testing/journal-path";

// A real MCP server over HTTP, which writes down what it was sent.
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
// `fetch` takes an options argument that Bun's own `fetch` calls with its server instead.
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
      // The name resolves to the address the test server is on; no request may reach it.
      { resolve: async () => ["127.0.0.1"] },
    );
    open.push(connected);
    expect(connected.tools).toEqual([]);
    expect(connected.results[0]?.error).toContain("private network");
    expect(seen.length).toBe(before);

    // The person's own switch lets it through, as it does an address on their network.
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
