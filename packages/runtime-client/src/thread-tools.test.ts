import { afterEach, describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AnyTool } from "@anvia/core";

import { lateBoundTools } from "./late-bound-tools";
import { directoryWorkspaces } from "./testing/directory-workspaces";

const workspaces: ReturnType<typeof directoryWorkspaces>[] = [];
afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((workspace) => workspace.dispose()));
});

// The tools of a thread as a run gives them to its agent: the sandbox's, behind the late-bound stand-ins.
async function agentTools(seed: (root: string) => Promise<void>) {
  const workspace = directoryWorkspaces(seed);
  workspaces.push(workspace);
  const box = await workspace.acquire({ id: "t1" }, async () => {
    throw new Error("no clone");
  });
  return lateBoundTools(box.tools, () => box.tools);
}
const call = (tools: AnyTool[], name: string, input: unknown) =>
  tools.find((tool) => tool.name === name)!.call(input as never, undefined as never) as Promise<
    Record<string, unknown>
  >;

describe("the agent's file and command tools", () => {
  test("read_file takes as many lines as its schema allows, not only the sandbox's own policy", async () => {
    const tools = await agentTools((root) =>
      writeFile(
        join(root, "long.txt"),
        Array.from({ length: 3000 }, (_, i) => `line ${i + 1}`).join("\\n"),
      ),
    );

    const read = await call(tools, "read_file", { path: "long.txt", lineCount: 10_000 });

    expect(String(read.content).split("\\n").length).toBeGreaterThan(2500);
    expect(String(read.content)).toContain("line 3000");
  });

  test("a command that prints megabytes comes back cut, with the end of it, and the run goes on", async () => {
    const tools = await agentTools(async () => undefined);

    const ran = await call(tools, "exec_command", {
      command: "head -c 3000000 /dev/zero | tr '\\\\0' x; echo; echo THE-END",
    });

    expect(String(ran.stdout).length).toBeLessThan(100_100);
    expect(String(ran.stdout)).toContain("THE-END");
    expect(ran.stdoutTruncated).toBe(true);
  });
});
