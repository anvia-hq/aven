import { createTool } from "@anvia/core";
import { MEMORY_NOTE_MAX, MEMORY_ROOT } from "@aven/protocol/memory";
import { z } from "zod";
import type { MemoryHost } from "./types";
import type { MemoryCommand } from "@aven/protocol/types";

export const MEMORY_TOOL_NAME = "memory";

export const memorySchema = z.object({
  command: z
    .enum(["view", "create", "str_replace", "insert", "delete", "rename"])
    .describe("What to do."),
  path: z
    .string()
    .optional()
    .describe(
      `The folder or note, as ${MEMORY_ROOT}/<folder>/<name>.md; ${MEMORY_ROOT} itself lists your folders. For every command but rename.`,
    ),
  view_range: z
    .tuple([z.number().int(), z.number().int()])
    .optional()
    .describe("For view of a note: the first and last line to show, -1 for the end."),
  file_text: z
    .string()
    .max(MEMORY_NOTE_MAX)
    .optional()
    .describe("For create: the whole note. It replaces a note of that name."),
  old_str: z.string().optional().describe("For str_replace: text that is in the note once."),
  new_str: z.string().optional().describe("For str_replace: what replaces it."),
  insert_line: z
    .number()
    .int()
    .optional()
    .describe("For insert: the line to insert after, 0 for the top."),
  insert_text: z.string().optional().describe("For insert: the lines to insert."),
  old_path: z.string().optional().describe("For rename: the note as it is."),
  new_path: z
    .string()
    .optional()
    .describe("For rename: where it goes, which may be another of your folders."),
});

type MemoryInput = z.infer<typeof memorySchema>;

function required<K extends keyof MemoryInput>(input: MemoryInput, key: K) {
  const value = input[key];

  if (value === undefined) throw new Error(`${input.command} needs ${key}`);

  return value as NonNullable<MemoryInput[K]>;
}

export function memoryCommandOf(input: MemoryInput): MemoryCommand {
  switch (input.command) {
    case "view":
      return { command: "view", path: required(input, "path"), viewRange: input.view_range };
    case "create":
      return {
        command: "create",
        path: required(input, "path"),
        fileText: required(input, "file_text"),
      };
    case "str_replace":
      return {
        command: "str_replace",
        path: required(input, "path"),
        oldStr: required(input, "old_str"),
        newStr: input.new_str ?? "",
      };
    case "insert":
      return {
        command: "insert",
        path: required(input, "path"),
        insertLine: required(input, "insert_line"),
        insertText: required(input, "insert_text"),
      };
    case "delete":
      return { command: "delete", path: required(input, "path") };
    case "rename":
      return {
        command: "rename",
        oldPath: required(input, "old_path"),
        newPath: required(input, "new_path"),
      };
  }
}

export function createMemoryTool(host: MemoryHost) {
  return createTool({
    name: MEMORY_TOOL_NAME,
    description: `Your memory: notes that outlive this conversation, kept as files in ${MEMORY_ROOT}. view lists a folder or shows a note with numbered lines; create writes a note (replacing one of that name); str_replace, insert, delete and rename change one. It is not a file system: the sandbox's commands cannot reach it.`,
    inputSchema: memorySchema,
    async execute(input) {
      return host(memoryCommandOf(input));
    },
  });
}
