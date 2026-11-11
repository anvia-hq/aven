import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AnyTool } from "@anvia/core";

import { HostSandboxes } from "./host-sandboxes";
import { createMachineCalls } from "./machine-calls";
import { RemoteWorkspaces } from "./remote-workspaces";
import { createRemoteRepo } from "./testing/remote-repo";
import type { MachineCall, ThreadSandbox } from "./types";

const homes: string[] = [];
const sandboxes: HostSandboxes[] = [];

afterEach(async () => {
  await Promise.all(sandboxes.splice(0).map((sandbox) => sandbox.dispose()));
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

async function machineAndAgent({ online = (): boolean => true }: { online?: () => boolean } = {}) {
  const home = await mkdtemp(join(tmpdir(), "aven-remote-"));
  homes.push(home);
  const sandbox = await HostSandboxes.start({ home });
  sandboxes.push(sandbox);
  const boxes = new Map<string, ThreadSandbox>();
  const answer = createMachineCalls({
    sandbox,
    boxes,
    idle: {
      starting: async () => undefined,
      schedule: () => undefined,
      releaseNow: async () => true,
    },
  });
  const ops: string[] = [];
  const callFor =
    (threadId: string): MachineCall =>
    async (op, args) => {
      ops.push(op);
      if (!online()) throw new Error("The computer is offline");
      return answer({ threadId, op, args: JSON.parse(JSON.stringify(args ?? {})) });
    };
  return { sandbox, ops, agent: new RemoteWorkspaces(callFor) };
}

const call = (tools: readonly AnyTool[], name: string, input: unknown) =>
  tools.find((tool) => tool.name === name)!.call(input as never, undefined as never) as Promise<
    Record<string, unknown>
  >;

describe("an agent whose computer is another machine", () => {
  test("knows the machine's paths before it prepares anything, and prepares the workspace on first use", async () => {
    const { sandbox, ops, agent } = await machineAndAgent();
    const { access } = await createRemoteRepo();

    const box = await agent.acquire({ id: "t1" }, async () => access);
    expect(agent.paths("t1")).toEqual(sandbox.paths("t1"));
    expect(ops).toEqual(["paths"]);

    const ran = await call(box.tools, "exec_command", { command: "git branch --show-current" });
    expect(String(ran.stdout)).toBe("aven/t1\n");
    expect(ops.slice(0, 3)).toEqual(["paths", "prepare", "exec"]);
    expect(await agent.workspace("t1")).toBe(sandbox.paths("t1").workspace);
  });

  test("edits a file on the machine with the agent's own tools", async () => {
    const { sandbox, agent } = await machineAndAgent();
    const { access } = await createRemoteRepo();
    const box = await agent.acquire({ id: "t1" }, async () => access);

    await call(box.tools, "write_file", { path: "notes.md", content: "one\n" });
    await call(box.tools, "edit", { path: "notes.md", oldString: "one", newString: "two" });

    expect(await readFile(join(sandbox.paths("t1").workspace, "notes.md"), "utf8")).toBe("two\n");
  });

  test("runs commands with the project's variables, which are not kept on the machine's disk", async () => {
    const { agent } = await machineAndAgent();
    const { access } = await createRemoteRepo();
    const box = await agent.acquire({ id: "t1" }, async () => access);
    agent.setProjectEnv("t1", [{ name: "TOKEN", value: "s3cret", secret: true }]);

    const ran = await call(box.tools, "exec_command", { command: "echo $TOKEN" });

    expect(String(ran.stdout)).toBe("s3cret\n");
  });

  test("a machine that is offline fails the tool, and is tried again on the next one", async () => {
    let up = false;
    const { agent } = await machineAndAgent({ online: () => up });
    const { access } = await createRemoteRepo();
    const box = await agent.acquire({ id: "t1" }, async () => access);
    expect(agent.paths("t1")).toBeUndefined();

    await expect(box.runtime!.exec({ command: "true" })).rejects.toThrow("The computer is offline");
    up = true;
    const ran = await box.runtime!.exec({ command: "cat README.md" });

    expect(new TextDecoder().decode(ran.stdout)).toBe("# remote\n");
  });

  test("sends a skill's archive only when the machine does not have it yet", async () => {
    const { agent } = await machineAndAgent();
    const { access } = await createRemoteRepo();
    const box = await agent.acquire({ id: "t1" }, async () => access);
    await box.start?.();
    const digest = "1".repeat(64);
    const archive = await new Bun.Archive(
      { "SKILL.md": "---\nname: notes\ndescription: Notes.\n---\nSteps." },
      { compress: "gzip" },
    ).bytes();
    const fetched: string[] = [];
    const fetch = async (wanted: string) => (fetched.push(wanted), archive);
    const skills = [{ name: "notes", description: "Notes.", digest }];

    const first = await agent.skills.install("t1", skills, fetch);
    const again = await agent.skills.install("t1", skills, fetch);

    expect(first.map((skill) => skill.name)).toEqual(["notes"]);
    expect(again.map((skill) => skill.name)).toEqual(["notes"]);
    expect(fetched).toEqual([digest]);
  });
});
