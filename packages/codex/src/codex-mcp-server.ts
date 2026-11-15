import type { CodexMcpTool } from "@aven/agent-backend/types";

type Rpc = {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
};

function schemaOf(shape: Record<string, { description?: string }>) {
  const properties: Record<string, { description?: string }> = {};
  for (const [key, field] of Object.entries(shape)) {
    properties[key] = field.description ? { description: field.description } : {};
  }
  return { type: "object", properties, additionalProperties: true };
}

async function answer(message: Rpc, tools: readonly CodexMcpTool[]) {
  const id = message.id;
  const method = message.method ?? "";
  const params = message.params ?? {};

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
          inputSchema: schemaOf(tool.shape),
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

export function serveCodexMcp(tools: readonly CodexMcpTool[]) {
  const session = crypto.randomUUID();
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(request) {
      if (request.method === "GET") {
        return new Response("event: ready\ndata: {}\n\n", {
          headers: { "content-type": "text/event-stream", "mcp-session-id": session },
        });
      }

      if (request.method === "DELETE") return new Response(null, { status: 202 });

      let message: Rpc;
      try {
        message = (await request.json()) as Rpc;
      } catch {
        return Response.json(
          { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
          { status: 400 },
        );
      }

      const body = await answer(message, tools);
      const headers = { "mcp-session-id": request.headers.get("mcp-session-id") ?? session };

      if (!body) return new Response(null, { status: 202, headers });

      return Response.json(body, { headers });
    },
  });
  return {
    url: `http://127.0.0.1:${server.port}/mcp`,
    close() {
      server.stop(true);
    },
  };
}
