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
const MAX_OUTPUT_CHARS = 30_000;

const decoder = new TextDecoder();

const flag = (on: unknown, args: string[]) => (on ? args : []);

const clipText = (text: string) =>
  text.length > MAX_LINE_CHARS ? `${text.slice(0, MAX_LINE_CHARS)}… [line cut]` : text;

function parseGrepLine(line: string, currentFile: string) {
  const matched = /^([^:]+):(\d+):(.*)$/.exec(line);

  if (matched) {
    return { file: matched[1]!, lineNum: matched[2]!, text: matched[3]! };
  }

  if (currentFile && line.startsWith(`${currentFile}-`)) {
    const rest = line.slice(currentFile.length + 1);
    const context = /^(\d+)-(.*)$/.exec(rest);

    if (context) return { file: currentFile, lineNum: context[1]!, text: context[2]! };
  }

  const context = /^(.+?)-(\d+)-(.*)$/.exec(line);

  if (context) {
    return { file: context[1]!, lineNum: context[2]!, text: context[3]! };
  }

  return undefined;
}

function formatGrouped(rawLines: readonly string[], maxResults: number) {
  const out: string[] = [];
  let currentFile = "";
  let shown = 0;
  let chars = 0;
  let cutByChars = false;

  for (const raw of rawLines) {
    if (shown >= maxResults) break;

    const line = raw.replace(/^\.\//, "");
    const parsed = parseGrepLine(line, currentFile);
    let formatted: string;

    if (parsed) {
      const header = parsed.file !== currentFile ? `${parsed.file}:\n` : "";
      currentFile = parsed.file;
      formatted = `${header}  Line ${parsed.lineNum}: ${clipText(parsed.text)}`;
    } else if (line === "--") {
      formatted = "  --";
    } else {
      formatted = clipText(line);
    }

    if (out.length > 0 && chars + formatted.length > MAX_OUTPUT_CHARS) {
      cutByChars = true;
      break;
    }

    out.push(formatted);
    chars += formatted.length + 1;
    shown += 1;
  }

  return { out, remaining: rawLines.length - shown, cutByChars };
}

export function createGrepTool(files: SearchableFiles) {
  return createTool({
    name: GREP_TOOL_NAME,
    description:
      "Search the text inside files for a pattern (an extended regular expression, or plain text with `fixed`). Returns matches grouped by file path with 1-based line numbers, skips binary files, .git and node_modules. Use it to find where something is defined or used before you read a file; use `find` to search by file name.",
    inputSchema: z.object({
      pattern: z.string().min(1).describe("What to look for."),
      path: z
        .string()
        .optional()
        .describe(
          "Single file or folder to search, relative to the workspace (default: the workspace).",
        ),
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

      const cut = result.status !== "exited" || result.stdoutTruncated;

      if (lines.length === 0 && !cut) return "No matches.";

      const { out, remaining, cutByChars } = formatGrouped(lines, maxResults);
      return withNotes(out, [
        remaining > 0 ? `${remaining} more lines not shown` : "",
        cutByChars ? "output size limit reached" : "",
        cut ? "the search was cut short" : "",
      ]);
    },
  });
}
