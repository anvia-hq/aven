import { posix } from "node:path";

import { createTool } from "@anvia/core";
import { z } from "zod";

import {
  DEFAULT_RESULTS,
  listing,
  listPaths,
  MAX_RESULTS,
  searchRoot,
} from "../internal/search-paths";
import type { SearchableFiles } from "./types";

export const FIND_TOOL_NAME = "find";

const escaped = (text: string) => text.replace(/[.+^${}()|[\]\\]/g, "\\$&");

function wildcardPart(char: string) {
  if (char === "*") return ".*";

  return char === "?" ? "." : escaped(char);
}

export function nameMatcher(name: string) {
  const wild = /[*?]/.test(name);
  const source = wild ? `^${[...name].map(wildcardPart).join("")}$` : escaped(name);
  const pattern = new RegExp(source, "i");

  return (path: string) => pattern.test(name.includes("/") ? path : posix.basename(path));
}

export function createFindTool(files: SearchableFiles) {
  return createTool({
    name: FIND_TOOL_NAME,
    description:
      "Find files or folders by name. `name` is matched case-insensitively against the file name: plain text matches anywhere in it, and `*` and `?` are wildcards. A name with a `/` is matched against the whole path. Skips .git and node_modules. Use it when you know part of a name but not where it is; use `grep` to search inside files and `glob` for path patterns.",
    inputSchema: z.object({
      name: z.string().min(1).describe("Part of the name, or a pattern with * and ?."),
      type: z
        .enum(["file", "directory", "any"])
        .optional()
        .describe("What to find (default file)."),
      path: z
        .string()
        .optional()
        .describe("Folder to search, relative to the workspace (default: the workspace)."),
      maxDepth: z.int().min(1).max(20).optional().describe("How many folders deep to look."),
      maxResults: z
        .int()
        .min(1)
        .max(MAX_RESULTS)
        .optional()
        .describe(`Paths to return (default ${DEFAULT_RESULTS}).`),
    }),
    async handler({ name, type = "file", path, maxDepth, maxResults = DEFAULT_RESULTS }, context) {
      const matches = nameMatcher(name);
      const { paths, cut } = await listPaths(files, {
        root: searchRoot(files.workdir, path),
        type,
        maxDepth,
        abortSignal: context?.abortSignal,
      });
      const found = paths.filter(matches);

      return found.length === 0 && !cut ? "Nothing found." : listing(found, maxResults, cut);
    },
  });
}
