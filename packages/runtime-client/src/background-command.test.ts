import type { AnyTool } from "@anvia/core";
import { afterEach, describe, expect, test } from "bun:test";

import { directoryWorkspaces } from "./testing/directory-workspaces";

const workspaces = directoryWorkspaces();
afterEach(() => workspaces.dispose());

async function exec() {
  const box = await workspaces.acquire({ id: "t1" });
  const tool = box.tools.find((candidate) => candidate.name === "exec_command") as AnyTool;
  return { tool, sandbox: workspaces.sandboxes.get("t1")! };
}

const run = (tool: AnyTool, args: Record<string, unknown>) =>
  tool.call(tool.parseInput!(args as never));

describe("exec_command with background", () => {
  test("tells the model about the option and keeps the rest of the sandbox's own description", async () => {
    const { tool } = await exec();

    const definition = await tool.definition("");

    const properties = definition.parameters.properties as Record<string, { type?: string }>;
    expect(Object.keys(properties)).toEqual(
      expect.arrayContaining(["command", "args", "cwd", "env", "timeoutMs", "input", "background"]),
    );
    expect(properties.background?.type).toBe("boolean");
    expect(definition.parameters.required).toEqual(["command"]);
    expect(definition.parameters.additionalProperties).toBe(false);
  });

  test("starts the command as a managed process and answers at once", async () => {
    const { tool, sandbox } = await exec();

    const answer = await run(tool, { command: "echo up; sleep 30", background: true });

    const [started] = await sandbox.listProcesses();
    expect(started).toMatchObject({ status: "running" });
    expect(String(answer)).toContain(`process ${started!.id}`);
    expect(String(answer)).toContain("Background tasks");
  });

  test("without the option it is the sandbox's own command: it waits and returns its output", async () => {
    const { tool, sandbox } = await exec();

    for (const args of [{ command: "echo hi" }, { command: "echo hi", background: false }]) {
      expect(JSON.stringify(await run(tool, args))).toContain("hi");
    }

    expect(await sandbox.listProcesses()).toEqual([]);
  });

  test("the option does not travel to the sandbox's command", async () => {
    const { tool } = await exec();

    expect(tool.parseInput!({ command: "ls", background: false } as never)).toEqual({
      command: "ls",
    });
  });

  test("refuses what has no meaning for a command that does not wait, and a wrong option", async () => {
    const { tool, sandbox } = await exec();

    expect(() => tool.parseInput!({ command: "x", background: true, timeoutMs: 1000 })).toThrow(
      "do not apply",
    );
    expect(() => tool.parseInput!({ command: "x", background: true, input: "y" })).toThrow(
      "do not apply",
    );
    expect(() => tool.parseInput!({ command: "x", background: "yes" })).toThrow("true or false");
    expect(await sandbox.listProcesses()).toEqual([]);
  });

  test("refuses a command that detaches itself and says to use background", async () => {
    const { tool, sandbox } = await exec();
    const detached = [
      "nohup python3 -m http.server 3010 > server.log 2>&1 &",
      "setsid nohup ./serve.sh",
      "cd app && (setsid ./run &)",
      "./serve.sh &",
      "npm start & \n echo ok",
      "sleep 5; disown",
    ];

    for (const command of detached) {
      expect(() => tool.parseInput!({ command })).toThrow("background: true");
      expect(() => tool.parseInput!({ command, background: true })).toThrow("background: true");
    }
    expect(() => tool.parseInput!({ command: "bash", args: ["-c", "nohup x &"] })).toThrow(
      "background: true",
    );
    expect(await sandbox.listProcesses()).toEqual([]);
  });

  test("lets through commands that only look like detaching", async () => {
    const { tool } = await exec();

    for (const command of [
      "make build && make test",
      "echo hi 2>&1",
      "ls > out.txt 2>&1",
      "grep nohupped file.txt",
      "echo a & echo b",
    ]) {
      expect(() => tool.parseInput!({ command })).not.toThrow();
    }
  });

  test("is still the tool the sandbox calls exec_command, among the others", async () => {
    const box = await workspaces.acquire({ id: "t1" });
    const names = box.tools.map((tool) => tool.name);

    expect(names.filter((name) => name === "exec_command")).toHaveLength(1);
    expect(names).toContain("start_process");
  });
});
