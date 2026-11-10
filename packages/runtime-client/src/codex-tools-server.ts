import type { AnyTool, JsonValue } from "@anvia/core";
import { isQuestionTool, normalizeToolResultOutput } from "@anvia/core/tool";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";

import { CODEX_AVEN_SERVER } from "@aven/agents/codex-projection";
import type { CodexQuestion, CodexToolsServer } from "./types";

type ToolResult = {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

const WAITING =
  "Your question has been sent. The answer will come as the next message of the user.";

const asText = (text: string, isError = false): ToolResult => {
  const result: ToolResult = { content: [{ type: "text", text }] };
  if (isError) result.isError = true;
  return result;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function toolResult(output: unknown): ToolResult {
  const result = normalizeToolResultOutput(output);
  switch (result.type) {
    case "text":
      return asText(result.value);
    case "error-text":
      return asText(result.value, true);
    case "json": {
      const text = JSON.stringify(result.value);
      return isRecord(result.value)
        ? { content: [{ type: "text", text }], structuredContent: result.value }
        : asText(text);
    }
    case "error-json":
      return asText(JSON.stringify(result.value), true);
    case "content":
      return asText(
        result.value.map((part) => (part.type === "text" ? part.text : `[${part.type}]`)).join(""),
      );
    case "execution-denied":
      return asText(result.reason ?? "Tool call was denied", true);
  }
}

const schemaOf = (parameters: Record<string, unknown>) => ({
  "~standard": {
    version: 1 as const,
    vendor: "aven",
    validate: (value: unknown) => ({ value }),
    jsonSchema: { input: () => parameters, output: () => parameters },
  },
});

export async function serveCodexTools(options: {
  tools: readonly AnyTool[];
  question?: (question: CodexQuestion) => void;
  hostname?: string;
}): Promise<CodexToolsServer> {
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "");
  const definitions = await Promise.all(options.tools.map((tool) => tool.definition("")));
  const handler = createMcpHandler(() => {
    const server = new McpServer({ name: CODEX_AVEN_SERVER, version: "1.0.0" });
    options.tools.forEach((tool, index) => {
      const { name, description, parameters } = definitions[index]!;
      server.registerTool(
        name,
        { description, inputSchema: schemaOf(parameters) },
        async (args: unknown, context: { mcpReq?: { signal?: AbortSignal } }) => {
          if (isQuestionTool(tool)) {
            options.question?.({ toolName: name, callId: crypto.randomUUID(), input: args });
            return asText(WAITING);
          }
          try {
            const input = tool.parseInput ? tool.parseInput(args as JsonValue) : args;
            return toolResult(await tool.call(input, { abortSignal: context.mcpReq?.signal }));
          } catch (error) {
            return asText(error instanceof Error ? error.message : String(error), true);
          }
        },
      );
    });
    return server;
  });
  const http = Bun.serve({
    port: 0,
    hostname: options.hostname ?? "127.0.0.1",
    fetch: (request) =>
      request.headers.get("authorization") === `Bearer ${token}`
        ? handler.fetch(request)
        : new Response("Unauthorized", { status: 401 }),
  });
  return {
    url: `http://${options.hostname ?? "127.0.0.1"}:${http.port}/`,
    token,
    close: async () => {
      await http.stop(true);
    },
  };
}
