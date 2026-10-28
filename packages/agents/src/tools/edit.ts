import { createTool } from "@anvia/core";
import { z } from "zod";

import { resolveWithin } from "../lib/paths";

export type EditToolOptions = {
  /** Directory the tool is confined to. Relative paths resolve against it. */
  root: string;
};

function countOccurrences(text: string, search: string) {
  let count = 0;
  for (let at = text.indexOf(search); at !== -1; at = text.indexOf(search, at + search.length)) {
    count++;
  }
  return count;
}

export function createEditTool({ root }: EditToolOptions) {
  return createTool({
    name: "edit",
    description:
      "Replace exact text in a file. `oldString` must match the file exactly (including whitespace) and be unique unless `replaceAll` is true. Read the file first so the text is accurate.",
    inputSchema: z.object({
      path: z.string().min(1).describe("File to edit."),
      oldString: z.string().describe("Exact text to find."),
      newString: z.string().describe("Replacement text; must differ from oldString."),
      replaceAll: z.boolean().optional().describe("Replace every occurrence (default false)."),
    }),
    async execute({ path, oldString, newString, replaceAll = false }) {
      if (oldString === "")
        throw new Error("oldString must not be empty; use `write` to create files");
      if (oldString === newString) throw new Error("oldString and newString are identical");

      const target = await resolveWithin(root, path);
      const file = Bun.file(target.absolute);
      if (!(await file.exists())) throw new Error(`File not found: ${path}`);
      const text = await file.text();

      const count = countOccurrences(text, oldString);
      if (count === 0) throw new Error(`oldString was not found in ${target.relative}`);
      if (count > 1 && !replaceAll) {
        throw new Error(
          `oldString matches ${count} places in ${target.relative}; add surrounding context to make it unique, or set replaceAll`,
        );
      }

      // Split/join and slice avoid `$` replacement patterns that String.replace would interpret.
      const next = replaceAll
        ? text.split(oldString).join(newString)
        : text.slice(0, text.indexOf(oldString)) +
          newString +
          text.slice(text.indexOf(oldString) + oldString.length);
      await Bun.write(target.absolute, next);
      return `Edited ${target.relative}: ${replaceAll ? count : 1} replacement(s)`;
    },
  });
}
