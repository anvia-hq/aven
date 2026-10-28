import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { createTool } from "@anvia/core";
import { z } from "zod";

import { resolveWithin } from "../lib/paths";

export type WriteToolOptions = {
  /** Directory the tool is confined to. Relative paths resolve against it. */
  root: string;
};

export function createWriteTool({ root }: WriteToolOptions) {
  return createTool({
    name: "write",
    description:
      "Write a file, overwriting it if it exists. Missing parent directories are created. Use it to create files or replace one wholesale; use `edit` for targeted changes.",
    inputSchema: z.object({
      path: z.string().min(1).describe("File to write."),
      content: z.string().describe("Full content of the file."),
    }),
    async execute({ path, content }) {
      const target = await resolveWithin(root, path);
      const existed = await Bun.file(target.absolute).exists();
      await mkdir(dirname(target.absolute), { recursive: true });
      await Bun.write(target.absolute, content);
      return `${existed ? "Wrote" : "Created"} file successfully: ${target.relative}`;
    },
  });
}
