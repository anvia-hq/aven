import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as z from "zod/v4";

import { HostSandboxes } from "./host-sandboxes";
import { createMachineCalls } from "./machine-calls";
import { normalizeToolResultOutput } from "@anvia/core/tool";
import { connectMcpServers } from "./mcp-servers";
import { combineMcp, connectMachineMcp, connectMcpForMachine } from "./machine-mcp";
import type { RunMcpServer } from "@aven/protocol/types";
import type { ConnectedMcp, MachineCall, ThreadSandbox } from "./types";

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

const homes: string[] = [];
const sandboxes: HostSandboxes[] = [];
const open: { close(): Promise<void> }[] = [];

afterEach(async () => {
  for (const item of open.splice(0)) await item.close();
  await Promise.all(sandboxes.splice(0).map((sandbox) => sandbox.dispose()));
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

async function machine() {
  const home = await mkdtemp(join(tmpdir(), "aven-machine-mcp-"));
  homes.push(home);
  const sandbox = await HostSandboxes.start({ home });
  sandboxes.push(sandbox);
  const boxes = new Map<string, ThreadSandbox>();
  const answer = createMachineCalls({
    sandbox,
    boxes,
    idle: {
      starting: async () => undefined,
      schedule: () => undefined,
      releaseNow: async () => true,
    },
    machineProcesses: { begin: async () => undefined, end: () => undefined, has: () => false },
  });
  let online = true;
  const call: MachineCall = async (op, args) => {
    if (!online) throw new Error("The computer is offline");
    return answer({ threadId: "t1", op, args: JSON.parse(JSON.stringify(args ?? {})) });
  };
  return { call, answer, offline: () => (online = false) };
}

describe("MCP servers reached through a machine", () => {
  test("a server marked local is connected by the machine, and its tools are called there", async () => {
    const { call } = await machine();
    seen.length = 0;

    const connected = await connectMcpForMachine([notes()], call);
    open.push(connected);

    expect(connected.results).toEqual([{ id: "11111111-1111-4111-8111-111111111111" }]);
    expect(connected.note).toEqual({ servers: [{ name: "Team Notes", tools: 1 }], failed: [] });
    const [tool] = connected.tools;
    expect(tool!.name).toBe("team_notes_add-note");
    expect(await tool!.definition("")).toMatchObject({ name: "team_notes_add-note" });
    const relayed = normalizeToolResultOutput(await tool!.call({ text: "hello" }));
    expect(relayed).toEqual({ type: "content", value: [{ type: "text", text: "Saved: hello" }] });
    const direct = await connectMcpServers([notes()]);
    open.push(direct);
    expect(normalizeToolResultOutput(await direct.tools[0]!.call({ text: "hello" }))).toEqual(
      relayed,
    );
    expect(seen[0]).toEqual({ authorization: "Bearer secret-token", note: "hello" });
  });

  test("a server not marked local stays with the control plane, and is refused on a private address", async () => {
    const { call } = await machine();

    const connected = await connectMcpForMachine(
      [
        notes({ allowLocal: false }),
        notes({ id: "22222222-2222-4222-8222-222222222222", name: "Other", allowLocal: true }),
      ],
      call,
    );
    open.push(connected);

    expect(connected.note.servers).toEqual([{ name: "Other", tools: 1 }]);
    expect(connected.note.failed.map((failure) => failure.name)).toEqual(["Team Notes"]);
    expect(connected.results).toContainEqual({ id: "22222222-2222-4222-8222-222222222222" });
  });

  test("with no way to reach the machine a local server is refused, as before", async () => {
    const connected = await connectMcpForMachine([notes()], undefined);
    open.push(connected);

    expect(connected.tools).toEqual([]);
    expect(connected.note.failed.map((failure) => failure.name)).toEqual(["Team Notes"]);
  });

  test("an offline machine fails its servers, and nothing else", async () => {
    const { call, offline } = await machine();
    offline();

    const connected = await connectMachineMcp([notes()], call);

    expect(connected.tools).toEqual([]);
    expect(connected.results).toEqual([
      { id: "11111111-1111-4111-8111-111111111111", error: "The computer is offline" },
    ]);
    expect(connected.note.failed).toEqual([
      { name: "Team Notes", reason: "The computer is offline" },
    ]);
  });

  test("closing, or releasing the thread, disconnects them", async () => {
    const { call, answer } = await machine();
    const first = await connectMachineMcp([notes()], call);
    await first.close();
    await expect(first.tools[0]!.call({ text: "late" })).rejects.toThrow("not connected");

    const second = await connectMachineMcp([notes()], call);
    await answer({ threadId: "t1", op: "release", args: {} });
    await expect(second.tools[0]!.call({ text: "late" })).rejects.toThrow("not connected");
  });

  test("a second connect with the same servers keeps the connection", async () => {
    const { call } = await machine();
    const first = await connectMachineMcp([notes()], call);
    const again = await connectMachineMcp([notes()], call);
    open.push(again);

    expect(await again.tools[0]!.call({ text: "still" })).toBeDefined();
    expect(first.tools.map((tool) => tool.name)).toEqual(again.tools.map((tool) => tool.name));
  });
});

describe("combineMcp", () => {
  const side = (id: string, name: string, tool: string): ConnectedMcp => {
    const tools = [{ name: tool, definition: () => ({}), call: async () => "" }] as never;
    return {
      tools,
      servers: [{ id, name, tools }],
      results: [{ id }],
      note: { servers: [{ name, tools: 1 }], failed: [] },
      close: async () => undefined,
    };
  };

  test("a machine server whose tool is named like one the control plane has is refused", () => {
    const merged = combineMcp(side("a", "Here", "notes_add"), side("b", "There", "notes_add"));

    expect(merged.tools).toHaveLength(1);
    expect(merged.results).toEqual([
      { id: "a" },
      { id: "b", error: expect.stringContaining("Here") },
    ]);
    expect(merged.note.servers).toEqual([{ name: "Here", tools: 1 }]);
    expect(merged.note.failed.map((failure) => failure.name)).toEqual(["There"]);
  });

  test("servers with different tools are all kept", () => {
    const merged = combineMcp(side("a", "Here", "one"), side("b", "There", "two"));

    expect(merged.tools.map((tool) => tool.name)).toEqual(["one", "two"]);
    expect(merged.results).toEqual([{ id: "a" }, { id: "b" }]);
    expect(merged.note.failed).toEqual([]);
  });
});
