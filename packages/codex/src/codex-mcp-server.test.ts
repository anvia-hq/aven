import { describe, expect, test } from "bun:test";

import { serveCodexMcp } from "./codex-mcp-server";
import type { CodexMcpTool } from "@aven/agent-backend/types";

const tool: CodexMcpTool = {
  name: "exec_command",
  description: "Run a command",
  shape: {},
  handler: async (args) => ({
    content: [{ type: "text", text: `ran ${JSON.stringify(args)}` }],
  }),
};

describe("the Codex MCP server", () => {
  test("answers initialize, tools/list and tools/call over JSON-RPC", async () => {
    const mcp = serveCodexMcp([tool]);
    try {
      const hello = await post(mcp, { jsonrpc: "2.0", id: 1, method: "initialize" });
      expect(hello.result.serverInfo).toEqual({ name: "aven", version: "1.0.0" });

      const listed = await post(mcp, { jsonrpc: "2.0", id: 2, method: "tools/list" });
      expect(listed.result.tools).toEqual([
        {
          name: "exec_command",
          description: "Run a command",
          inputSchema: { type: "object", properties: {}, additionalProperties: true },
        },
      ]);

      const called = await post(mcp, {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "exec_command", arguments: { command: "pwd" } },
      });
      expect(called.result.content[0].text).toContain("pwd");

      const note = await fetch(mcp.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${mcp.token}`,
        },
        body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      });
      expect(note.status).toBe(202);
    } finally {
      mcp.close();
    }
  });

  test("opens an event stream for an authenticated GET", async () => {
    const mcp = serveCodexMcp([tool]);
    try {
      const denied = await fetch(mcp.url, { method: "GET" });
      expect(denied.status).toBe(401);

      const stream = await fetch(mcp.url, {
        method: "GET",
        headers: { authorization: `Bearer ${mcp.token}` },
      });
      expect(stream.status).toBe(200);
      expect(stream.headers.get("content-type")).toContain("text/event-stream");
      expect(stream.headers.get("mcp-session-id")?.length).toBeGreaterThan(0);
      expect(await stream.text()).toBe("event: ready\ndata: {}\n\n");
    } finally {
      mcp.close();
    }
  });

  test("refuses a call with no token, the wrong token, or a browser Origin", async () => {
    const mcp = serveCodexMcp([tool]);
    try {
      const open = await fetch(mcp.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
      expect(open.status).toBe(401);

      const wrong = await fetch(mcp.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer not-the-token",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call" }),
      });
      expect(wrong.status).toBe(401);

      const browser = await fetch(mcp.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${mcp.token}`,
          origin: "https://evil.example",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call" }),
      });
      expect(browser.status).toBe(403);
    } finally {
      mcp.close();
    }
  });
});

async function post(mcp: { url: string; token: string }, body: unknown) {
  const response = await fetch(mcp.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${mcp.token}`,
    },
    body: JSON.stringify(body),
  });
  return (await response.json()) as {
    result: {
      serverInfo?: { name: string; version: string };
      tools: { name: string; description: string; inputSchema: unknown }[];
      content: { text: string }[];
    };
  };
}
