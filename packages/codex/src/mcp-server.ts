import { timingSafeEqual } from "node:crypto";

import { mcpInputSchema } from "@aven/agent-backend/mcp";
import type { BackendMcpTool } from "@aven/agent-backend/types";

type Rpc = {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: unknown;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function authorized(header: string | null, token: string): boolean {
  const expected = Buffer.from(`Bearer ${token}`);
  const actual = Buffer.from(header ?? "");

  if (actual.length !== expected.length) return false;

  return timingSafeEqual(actual, expected);
}

function schemaOf(tool: BackendMcpTool) {
  return tool.inputSchema ?? mcpInputSchema(tool.shape);
}

async function answer(message: Rpc, tools: readonly BackendMcpTool[]) {
  const id = message.id;
  const method = typeof message.method === "string" ? message.method : "";
  const params = isPlainObject(message.params) ? message.params : {};

  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2025-03-26",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "aven", version: "1.0.0" },
      },
    };
  }

  if (method === "ping") return { jsonrpc: "2.0", id, result: {} };

  if (method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: schemaOf(tool),
        })),
      },
    };
  }

  if (method === "tools/call") {
    const name = typeof params.name === "string" ? params.name : "";
    const args = params.arguments ?? {};
    const tool = tools.find((item) => item.name === name);

    if (!tool) {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: `This agent has no tool named ${name}` }],
          isError: true,
        },
      };
    }

    try {
      const result = await tool.handler(args);
      return { jsonrpc: "2.0", id, result };
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      return {
        jsonrpc: "2.0",
        id,
        result: { content: [{ type: "text", text }], isError: true },
      };
    }
  }

  if (id === undefined || id === null) return undefined;

  return {
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Unknown method ${method}` },
  };
}

export function serveCodexMcp(tools: readonly BackendMcpTool[]) {
  const session = crypto.randomUUID();
  const token = crypto.randomUUID();
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(request) {
      if (request.headers.has("origin")) {
        return new Response(null, { status: 403 });
      }

      if (!authorized(request.headers.get("authorization"), token)) {
        return new Response(null, { status: 401 });
      }

      if (request.method === "GET") {
        return new Response("event: ready\ndata: {}\n\n", {
          headers: { "content-type": "text/event-stream", "mcp-session-id": session },
        });
      }

      if (request.method === "DELETE") return new Response(null, { status: 202 });

      if (request.method !== "POST") {
        return new Response(null, { status: 405, headers: { allow: "GET, POST, DELETE" } });
      }

      let parsed: unknown;
      try {
        parsed = await request.json();
      } catch {
        return Response.json(
          { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
          { status: 400 },
        );
      }

      if (!isPlainObject(parsed)) {
        return Response.json(
          { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } },
          { status: 400 },
        );
      }

      const body = await answer(parsed as Rpc, tools);
      const headers = { "mcp-session-id": request.headers.get("mcp-session-id") ?? session };

      if (!body) return new Response(null, { status: 202, headers });

      return Response.json(body, { headers });
    },
  });
  return {
    url: `http://127.0.0.1:${server.port}/mcp`,
    token,
    close() {
      server.stop(true);
    },
  };
}
