import { readdir, stat } from "node:fs/promises";
import { createTool } from "@anvia/core";
import { z } from "zod";

import { resolveWithin } from "../lib/paths";

const MAX_LINES = 2000;
const MAX_LINE_CHARS = 2000;

export type ReadToolOptions = {
  /** Directory the tool is confined to. Relative paths resolve against it. */
  root: string;
};

export function createReadTool({ root }: ReadToolOptions) {
  return createTool({
    name: "read",
    description:
      "Read a file or list a directory. Text lines are prefixed with their 1-based line number as `N: content`. Reads up to 2000 lines at a time; pass `offset` to continue a long file.",
    inputSchema: z.object({
      path: z.string().min(1).describe("File or directory to read."),
      offset: z.number().int().min(1).optional().describe("1-based line or entry to start from."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(MAX_LINES)
        .optional()
        .describe("Maximum lines or entries to read (default and max 2000)."),
    }),
    async execute({ path, offset = 1, limit = MAX_LINES }) {
      const target = await resolveWithin(root, path);
      const info = await stat(target.absolute).catch(() => undefined);
      if (!info) throw new Error(`File not found: ${path}`);

      if (info.isDirectory()) {
        const entries = (await readdir(target.absolute, { withFileTypes: true }))
          .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
          .sort();
        return page(`directory ${target.relative}`, "entries", entries, offset, limit);
      }

      const bytes = new Uint8Array(await Bun.file(target.absolute).arrayBuffer());
      if (bytes.subarray(0, 8192).includes(0)) throw new Error(`Cannot read binary file: ${path}`);
      const lines = new TextDecoder().decode(bytes).split("\n");
      // A trailing newline is not an extra empty line.
      if (lines.at(-1) === "") lines.pop();
      const numbered = lines.map((line, index) => {
        const text =
          line.length > MAX_LINE_CHARS ? `${line.slice(0, MAX_LINE_CHARS)}… [truncated]` : line;
        return `${index + 1}: ${text}`;
      });
      return page(`file ${target.relative}`, "lines", numbered, offset, limit);
    },
  });
}

function page(label: string, unit: string, items: string[], offset: number, limit: number) {
  if (items.length === 0) return `Read ${label}, 0 ${unit}`;
  if (offset > items.length) {
    throw new Error(`Offset ${offset} is beyond the end (${items.length} ${unit})`);
  }
  const slice = items.slice(offset - 1, offset - 1 + limit);
  const last = offset + slice.length - 1;
  const out = [`Read ${label}, ${unit} ${offset}-${last} of ${items.length}`, ...slice];
  if (last < items.length) out.push(`[Truncated. Continue reading with offset: ${last + 1}]`);
  return out.join("\n");
}
