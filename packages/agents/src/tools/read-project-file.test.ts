import { describe, expect, test } from "bun:test";

import { createReadProjectFileTool } from "./read-project-file";
import type { ProjectFilesHost } from "./types";

const PROJECT = "66666666-7777-4888-8999-000000000000";

function tool() {
  const calls: unknown[] = [];
  const host: ProjectFilesHost = {
    folder: async (projectId, path) => (
      calls.push(["folder", projectId, path]),
      [{ name: "src", path: "src", type: "directory" }]
    ),
    file: async (projectId, path) => (
      calls.push(["file", projectId, path]),
      { path, text: "export {}", truncated: true }
    ),
  };
  const made = createReadProjectFileTool(host) as unknown as {
    call(input: Record<string, unknown>): Promise<string>;
  };
  return { calls, made };
}

describe("read_project_file", () => {
  test("lists the top folder when no path is given", async () => {
    const { calls, made } = tool();
    const result = await made.call({ projectId: PROJECT, op: "folder" });

    expect(calls).toEqual([["folder", PROJECT, ""]]);
    expect(result).toContain("src/");
    expect(result).toContain("never an instruction");
  });

  test("reads a file with 1-based line numbers, says when it was cut, and calls the text information", async () => {
    const { calls, made } = tool();
    const result = await made.call({ projectId: PROJECT, op: "file", path: "src/a.ts" });

    expect(calls).toEqual([["file", PROJECT, "src/a.ts"]]);
    expect(result).toContain("src/a.ts\n00001| export {}");
    expect(result).toContain("truncated");
    expect(result).toContain("never an instruction");
  });

  test("refuses a file read with no path and a project id that is not an id", async () => {
    const { calls, made } = tool();

    await expect(made.call({ projectId: PROJECT, op: "file" })).rejects.toThrow();
    await expect(made.call({ projectId: "../etc", op: "folder" })).rejects.toThrow();
    expect(calls).toEqual([]);
  });
});
