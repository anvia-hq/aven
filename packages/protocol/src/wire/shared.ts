import { z } from "zod";

import {
  COCKPIT_BODY_MAX,
  COCKPIT_KINDS,
  COCKPIT_TITLE_MAX,
  TAGS_MAX,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from "../cockpit";
import { MCP_LIMIT } from "../mcp";
import { MEMORY_NOTE_MAX } from "../memory";
import type { CockpitCommand, McpConnectResult, MemoryCommand } from "../types";

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

const cockpitKind = z.enum(COCKPIT_KINDS);
const cockpitId = z.string().min(1).max(100);
const cockpitFields = z.object({
  title: z.string().max(COCKPIT_TITLE_MAX).optional(),
  body: z.string().max(COCKPIT_BODY_MAX).optional(),
  tags: z.array(z.string().max(64)).max(TAGS_MAX).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  dueDate: z.string().max(64).nullable().optional(),
  done: z.boolean().optional(),
  pinned: z.boolean().optional(),
});

export const cockpitCommand = z.discriminatedUnion("command", [
  z.object({
    command: z.literal("list"),
    kind: cockpitKind,
    tag: z.string().max(64).optional(),
    query: z.string().max(200).optional(),
    status: z.enum(TASK_STATUSES).optional(),
    done: z.boolean().optional(),
  }),
  z.object({ command: z.literal("get"), kind: cockpitKind, id: cockpitId }),
  z.object({ command: z.literal("tags") }),
  z.object({
    command: z.literal("create"),
    kind: cockpitKind,
    fields: cockpitFields.extend({ title: z.string().max(COCKPIT_TITLE_MAX) }),
  }),
  z.object({
    command: z.literal("update"),
    kind: cockpitKind,
    id: cockpitId,
    fields: cockpitFields,
  }),
  z.object({ command: z.literal("delete"), kind: cockpitKind, id: cockpitId }),
  z.object({ command: z.literal("convert"), id: cockpitId, fields: cockpitFields.optional() }),
]) satisfies z.ZodType<CockpitCommand>;

export function parseParams<T>(schema: z.ZodType<T>, params: unknown): T {
  const parsed = schema.safeParse(params);

  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    throw new Error(`Invalid parameters: ${issue.path.join(".") || "params"} ${issue.message}`);
  }

  return parsed.data;
}
