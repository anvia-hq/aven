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
      const hello = await post(mcp.url, { jsonrpc: "2.0", id: 1, method: "initialize" });
      expect(hello.result.serverInfo).toEqual({ name: "aven", version: "1.0.0" });

      const listed = await post(mcp.url, { jsonrpc: "2.0", id: 2, method: "tools/list" });
      expect(listed.result.tools).toEqual([
        {
          name: "exec_command",
          description: "Run a command",
          inputSchema: { type: "object", properties: {}, additionalProperties: true },
        },
      ]);

      const called = await post(mcp.url, {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "exec_command", arguments: { command: "pwd" } },
      });
      expect(called.result.content[0].text).toContain("pwd");

      const note = await fetch(mcp.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      });
      expect(note.status).toBe(202);
    } finally {
      mcp.close();
    }
  });
});

async function post(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
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
