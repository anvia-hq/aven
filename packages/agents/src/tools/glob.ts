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

export const GLOB_TOOL_NAME = "glob";

export function createGlobTool(files: SearchableFiles) {
  return createTool({
    name: GLOB_TOOL_NAME,
    description:
      "List files whose path matches a glob pattern, such as `src/**/*.ts` or `**/*.test.tsx`. Paths are relative to the search folder, sorted, and skip .git and node_modules. Use it when you know the shape of the path; use `find` to look for a name.",
    inputSchema: z.object({
      pattern: z
        .string()
        .min(1)
        .describe("Glob pattern, matched against the path, e.g. `src/**/*.ts`."),
      path: z
        .string()
        .optional()
        .describe("Folder to search, relative to the workspace (default: the workspace)."),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(MAX_RESULTS)
        .optional()
        .describe(`Paths to return (default ${DEFAULT_RESULTS}).`),
    }),
    async handler({ pattern, path, maxResults = DEFAULT_RESULTS }, context) {
      const matcher = new Bun.Glob(pattern);
      const { paths, cut } = await listPaths(files, {
        root: searchRoot(files.workdir, path),
        type: "file",
        abortSignal: context?.abortSignal,
      });
      const matches = paths.filter((entry) => matcher.match(entry));

      return matches.length === 0 && !cut ? "No files match." : listing(matches, maxResults, cut);
    },
  });
}
