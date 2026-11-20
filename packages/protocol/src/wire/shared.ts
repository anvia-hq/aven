import { z } from "zod";

import { MCP_LIMIT } from "../mcp";
import { MEMORY_NOTE_MAX } from "../memory";
import type { McpConnectResult, MemoryCommand } from "../types";

export const runId = z.string().min(1);
export const replyId = z.string().min(1);

export const mcpConnectResults = z
  .array(z.object({ id: z.uuid(), error: z.string().trim().max(500).optional() }))
  .max(MCP_LIMIT) satisfies z.ZodType<McpConnectResult[]>;

const memoryPath = z.string().min(1).max(200);
const memoryText = z.string().max(MEMORY_NOTE_MAX);
const lineNumber = z.int().min(-1).max(100_000);

export const memoryCommand = z.discriminatedUnion("command", [
  z.object({
    command: z.literal("view"),
    path: memoryPath,
    viewRange: z.tuple([lineNumber, lineNumber]).optional(),
  }),
  z.object({ command: z.literal("create"), path: memoryPath, fileText: memoryText }),
  z.object({
    command: z.literal("str_replace"),
    path: memoryPath,
    oldStr: memoryText,
    newStr: memoryText,
  }),
  z.object({
    command: z.literal("insert"),
    path: memoryPath,
    insertLine: lineNumber,
    insertText: memoryText,
  }),
  z.object({ command: z.literal("delete"), path: memoryPath }),
  z.object({ command: z.literal("rename"), oldPath: memoryPath, newPath: memoryPath }),
]) satisfies z.ZodType<MemoryCommand>;

export function parseParams<T>(schema: z.ZodType<T>, params: unknown): T {
  const parsed = schema.safeParse(params);

  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    throw new Error(`Invalid parameters: ${issue.path.join(".") || "params"} ${issue.message}`);
  }

  return parsed.data;
}
