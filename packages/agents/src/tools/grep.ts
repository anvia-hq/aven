import { createTool } from "@anvia/core";
import { z } from "zod";

import {
  DEFAULT_RESULTS,
  MAX_RESULTS,
  searchRoot,
  SEARCH_TIMEOUT_MS,
  SKIPPED_DIRECTORIES,
  withNotes,
} from "../internal/search-paths";
import type { SearchableFiles } from "./types";

export const GREP_TOOL_NAME = "grep";

const MAX_LINE_CHARS = 300;

const decoder = new TextDecoder();

const flag = (on: unknown, args: string[]) => (on ? args : []);

const clipped = (raw: string) => {
  const line = raw.replace(/^\.\//, "");
  return line.length > MAX_LINE_CHARS ? `${line.slice(0, MAX_LINE_CHARS)}… [line cut]` : line;
};

export function createGrepTool(files: SearchableFiles) {
  return createTool({
    name: GREP_TOOL_NAME,
    description:
      "Search the text inside files for a pattern (an extended regular expression, or plain text with `fixed`). Returns `path:line:text` lines, skips binary files, .git and node_modules. Use it to find where something is defined or used before you read a file; use `find` to search by file name.",
    inputSchema: z.object({
      pattern: z.string().min(1).describe("What to look for."),
      path: z
        .string()
        .optional()
        .describe("File or folder to search, relative to the workspace (default: the workspace)."),
      include: z
        .string()
        .optional()
        .describe("Only search files whose name matches this, e.g. `*.ts`."),
      ignoreCase: z.boolean().optional().describe("Match upper and lower case alike."),
      fixed: z
        .boolean()
        .optional()
        .describe("Treat the pattern as plain text, not a regular expression."),
      context: z.int().min(0).max(5).optional().describe("Lines to show around each match."),
      maxResults: z
        .int()
        .min(1)
        .max(MAX_RESULTS)
        .optional()
        .describe(`Output lines to return (default ${DEFAULT_RESULTS}).`),
    }),
    async handler(
      { pattern, path, include, ignoreCase, fixed, context: around, maxResults = DEFAULT_RESULTS },
      context,
    ) {
      const result = await files.exec({
        command: "grep",
        args: [
          "-rnIH",
          fixed ? "-F" : "-E",
          ...flag(ignoreCase, ["-i"]),
          ...flag(around, ["-C", String(around)]),
          ...SKIPPED_DIRECTORIES.map((name) => `--exclude-dir=${name}`),
          ...flag(include, [`--include=${include}`]),
          "-e",
          pattern,
          "--",
          searchRoot(files.workdir, path),
        ],
        cwd: files.workdir,
        timeoutMs: SEARCH_TIMEOUT_MS,
        abortSignal: context?.abortSignal,
      });
      const text = decoder.decode(result.stdout);
      const lines = text.split("\n").filter(Boolean);

      if (result.status === "exited" && result.exitCode > 1 && lines.length === 0) {
        throw new Error(
          decoder.decode(result.stderr).trim() || `grep exited with ${result.exitCode}`,
        );
      }

      if (lines.length === 0 && result.status === "exited") return "No matches.";

      const cut = result.status === "timed_out" || result.stdoutTruncated;
      const shown = lines.slice(0, maxResults).map(clipped);
      return withNotes(shown, [
        lines.length > maxResults ? `${lines.length - maxResults} more lines not shown` : "",
        cut ? "the search was cut short" : "",
      ]);
    },
  });
}
