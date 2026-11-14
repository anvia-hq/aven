import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import * as z from "zod/v4";

import { connectMcpServers } from "./mcp-servers";
import type { RunMcpServer } from "@aven/protocol/types";

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
});
