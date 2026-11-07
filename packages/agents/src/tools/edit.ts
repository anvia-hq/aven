import { posix } from "node:path";

import { createTool } from "@anvia/core";
import { z } from "zod";
import type { EditableFiles } from "./types";

export const EDIT_TOOL_NAME = "edit";

function countOccurrences(text: string, search: string) {
  let count = 0;
  for (let at = text.indexOf(search); at !== -1; at = text.indexOf(search, at + search.length)) {
    count++;
  }
  return count;
}

function workspacePath(workdir: string, input: string) {
  const normalized = posix.normalize(input.replaceAll("\\", "/"));
  const relative = posix.isAbsolute(normalized) ? posix.relative(workdir, normalized) : normalized;
  if (relative === "" || relative === "." || relative === ".." || relative.startsWith("../")) {
    throw new Error(`Path is not a file inside the workspace: ${input}`);
  }
  return relative;
}

export function createEditTool(files: EditableFiles) {
  return createTool({
    name: EDIT_TOOL_NAME,
    description:
      "Replace exact text in a file. `oldString` must match the file exactly (including whitespace) and be unique unless `replaceAll` is true. Read the file first so the text is accurate.",
    inputSchema: z.object({
      path: z.string().min(1).describe("File to edit."),
      oldString: z.string().describe("Exact text to find."),
      newString: z.string().describe("Replacement text; must differ from oldString."),
      replaceAll: z.boolean().optional().describe("Replace every occurrence (default false)."),
    }),
    async execute({ path, oldString, newString, replaceAll = false }, context) {
      if (oldString === "") {
        throw new Error("oldString must not be empty; use `write_file` to create files");
      }
      if (oldString === newString) throw new Error("oldString and newString are identical");

      const target = workspacePath(files.workdir, path);
      const abortSignal = context?.abortSignal;
      const text = await files.readTextFile({ path: target, abortSignal });

      const firstMatch = text.indexOf(oldString);
      const count = firstMatch === -1 ? 0 : countOccurrences(text, oldString);
      if (count === 0) throw new Error(`oldString was not found in ${target}`);
      if (count > 1 && !replaceAll) {
        throw new Error(
          `oldString matches ${count} places in ${target}; add surrounding context to make it unique, or set replaceAll`,
        );
      }

      const next = replaceAll
        ? text.split(oldString).join(newString)
        : text.slice(0, firstMatch) + newString + text.slice(firstMatch + oldString.length);
      await files.writeTextFile({ path: target, text: next, abortSignal });
      return `Edited ${target}: ${replaceAll ? count : 1} replacement(s)`;
    },
  });
}
