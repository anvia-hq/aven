import type { AnyTool, JsonValue, ToolResultOutput } from "@anvia/core";
import { projectToolCall, projectToolEnd } from "@aven/agents/tool-projection";
import { QUESTION_TOOL_NAME, SECRET_TOOL_NAME } from "@aven/protocol/events";
import { createServer, type Server, type Socket } from "node:net";
import { unlinkSync } from "node:fs";

import { toolOutput } from "./codex-events";

export type CodexToolSink = {
  started(id: string, name: string, input: JsonValue): void;
  finished(id: string, name: string, output: ToolResultOutput): void;
  park(call: { id: string; name: string; input: JsonValue }): Promise<string>;
};

const QUESTIONS = new Set([QUESTION_TOOL_NAME, SECRET_TOOL_NAME]);

export class CodexToolHost {
  #tools: readonly AnyTool[];
  #sink: CodexToolSink;
  #calls = 0;
  #signal: AbortSignal | undefined;

  constructor(tools: readonly AnyTool[], sink: CodexToolSink) {
    this.#tools = tools;
    this.#sink = sink;
  }

  bind(signal: AbortSignal) {
    this.#signal = signal;
  }

  async list() {
    return Promise.all(
      this.#tools.map(async (tool) => {
        const defined = await tool.definition("");
        return {
          name: defined.name,
          description: defined.description,
          inputSchema: defined.parameters,
        };
      }),
    );
  }

  async call(name: string, args: unknown, signal?: AbortSignal): Promise<string> {
    const answered = await this.#invoke(name, args, signal ?? this.#signal);
    return answered.text;
  }

  async #invoke(name: string, args: unknown, signal?: AbortSignal) {
    const tool = this.#tools.find((candidate) => candidate.name === name);

    if (!tool) throw new Error(`Unknown tool ${name}`);

    const id = `codex-tool-${++this.#calls}`;
    const input = jsonValue(tool.parseInput ? tool.parseInput(jsonValue(args)) : args);
    this.#sink.started(id, name, input);

    try {
      signal?.throwIfAborted();
      const asked = QUESTIONS.has(name);
      const value = asked
        ? await this.#sink.park({ id, name, input })
        : await tool.call(input, { abortSignal: signal });
      const output = toolOutput(value);
      this.#sink.finished(id, name, output);
      const text = asked && typeof value === "string" ? value : textOf(output);
      return { text, failed: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.#sink.finished(id, name, { type: "error-text", value: message });
      return { text: message, failed: true };
    }
  }

  async handle(message: Rpc): Promise<Rpc | undefined> {
    if (message.id === undefined || message.method === undefined) return undefined;

    try {
      const result = await this.#result(message.method, message.params);
      return { jsonrpc: "2.0", id: message.id, result };
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32000, message: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  async #result(method: string, params: unknown) {
    if (method === "initialize") {
      return {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "aven", version: "0" },
      };
    }

    if (method === "tools/list") return { tools: await this.list() };

    if (method === "tools/call") {
      const { name, arguments: args } = record(params);
      const answered = await this.#invoke(String(name), args, this.#signal);
      return { content: [{ type: "text", text: answered.text }], isError: answered.failed };
    }

    throw new Error(`Unknown method ${method}`);
  }
}

export function serveCodexTools(socketPath: string, host: CodexToolHost): Promise<Server> {
  try {
    unlinkSync(socketPath);
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error ? error.code : undefined;

    if (code !== "ENOENT") throw error;
  }

  const server = createServer((socket) => attach(socket, host));
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => {
      server.removeListener("error", reject);
      resolve(server);
    });
  });
}

function attach(socket: Socket, host: CodexToolHost) {
  const write = (message: unknown) => socket.write(encodeFrame(message));
  const read = createFrameReader((message) => {
    void host.handle(message as Rpc).then((response) => {
      if (response) write(response);
    });
  });
  socket.on("data", (chunk) => read(Buffer.from(chunk)));
}

export function encodeFrame(message: unknown) {
  const body = Buffer.from(JSON.stringify(message));
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]);
}

export function createFrameReader(onMessage: (value: unknown) => void) {
  let buffer = Buffer.alloc(0);
  return (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);

    for (;;) {
      const headerEnd = buffer.indexOf("\r\n\r\n");

      if (headerEnd < 0) return;

      const header = buffer.subarray(0, headerEnd).toString("utf8");
      const match = /content-length:\s*(\d+)/i.exec(header);

      if (!match?.[1]) {
        buffer = buffer.subarray(headerEnd + 4);
        continue;
      }

      const length = Number(match[1]);
      const start = headerEnd + 4;

      if (buffer.length < start + length) return;

      const body = buffer.subarray(start, start + length).toString("utf8");
      buffer = buffer.subarray(start + length);
      onMessage(JSON.parse(body));
    }
  };
}

export function projectCall(id: string, name: string, input: JsonValue) {
  return projectToolCall({ type: "tool-call", toolCallId: id, toolName: name, input });
}

export function projectEnd(id: string, name: string, output: ToolResultOutput) {
  return projectToolEnd(id, output, name);
}

type Rpc = {
  jsonrpc?: "2.0";
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
};

function jsonValue(value: unknown): JsonValue {
  return structuredClone(value ?? {}) as JsonValue;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function textOf(output: ToolResultOutput) {
  if (output.type === "text" || output.type === "error-text") return output.value;

  return JSON.stringify(
    output.type === "execution-denied" ? { reason: output.reason } : output.value,
  );
}
