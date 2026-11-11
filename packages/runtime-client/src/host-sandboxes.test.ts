import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AnyTool } from "@anvia/core";

import { HostSandboxes } from "./host-sandboxes";
import { createRemoteRepo } from "./testing/remote-repo";

const homes: string[] = [];
const sandboxes: HostSandboxes[] = [];

async function runner() {
  const home = await mkdtemp(join(tmpdir(), "aven-host-"));
  homes.push(home);
  const sandbox = await HostSandboxes.start({ home });
  sandboxes.push(sandbox);
  return { sandbox, home: await realpath(home) };
}

afterEach(async () => {
  await Promise.all(sandboxes.splice(0).map((sandbox) => sandbox.dispose()));
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

const call = (tools: readonly AnyTool[], name: string, input: unknown) =>
  tools.find((tool) => tool.name === name)!.call(input as never, undefined as never) as Promise<
    Record<string, unknown>
  >;

describe("a runner that works on this machine", () => {
  test("clones the repository into a folder of the thread and tells the agent that real path", async () => {
    const { sandbox, home } = await runner();
    const { access } = await createRemoteRepo();

    const box = await sandbox.acquire({ id: "t1" }, async () => access);

    const paths = sandbox.paths("t1");
    expect(paths.workspace).toBe(join(home, "workspaces", "t1"));
    expect(paths.host).toBe(true);
    expect(await sandbox.workspace("t1")).toBe(paths.workspace);
    const ran = await call(box.tools, "exec_command", {
      command: "pwd; git branch --show-current",
    });
    expect(String(ran.stdout)).toContain(`${paths.workspace}\n`);
    expect(String(ran.stdout)).toContain("aven/t1");
    expect(await readFile(join(paths.workspace, "README.md"), "utf8")).toBe("# remote\n");
  });

  test("runs commands on the machine with the project's variables, and reaches files by their real path", async () => {
    const { sandbox } = await runner();
    const { access } = await createRemoteRepo();
    sandbox.setProjectEnv("t1", [{ name: "PROJECT_TOKEN", value: "s3cret", secret: true }]);
    const box = await sandbox.acquire({ id: "t1" }, async () => access);
    const { workspace } = sandbox.paths("t1");

    const ran = await call(box.tools, "exec_command", { command: 'echo "$PROJECT_TOKEN"; whoami' });
    await call(box.tools, "write_file", { path: join(workspace, "notes.txt"), content: "hi" });

    expect(String(ran.stdout)).toContain("s3cret");
    expect(await readFile(join(workspace, "notes.txt"), "utf8")).toBe("hi");
    const refused = call(box.tools, "read_file", { path: "/etc/hosts" });
    await expect(refused).rejects.toThrow();
  });

  test("starts a fork from its parent's work, and keeps threads' folders apart", async () => {
    const { sandbox } = await runner();
    const { access } = await createRemoteRepo();
    await sandbox.acquire({ id: "parent" }, async () => access);
    await writeFile(join(sandbox.paths("parent").workspace, "wip.txt"), "unsaved");

    await sandbox.acquire({ id: "child", forkOf: "parent" }, async () => access);

    expect(await readFile(join(sandbox.paths("child").workspace, "wip.txt"), "utf8")).toBe(
      "unsaved",
    );
    expect(sandbox.paths("child").workspace).not.toBe(sandbox.paths("parent").workspace);
  });

  test("gives a thread with no repository, like a bot, a folder of its own", async () => {
    const { sandbox } = await runner();

    const box = await sandbox.acquire({ id: "bot-1" });

    const ran = await call(box.tools, "exec_command", { command: "pwd" });
    expect(String(ran.stdout).trim()).toBe(sandbox.paths("bot-1").workspace);
    expect(await sandbox.workspace("bot-1")).toBeUndefined();
  });

  test("keeps uploads and skills in folders the agent can read by their real path", async () => {
    const { sandbox } = await runner();

    const uploaded = await sandbox.uploads.save("t1", "a.txt", new TextEncoder().encode("x"));
    const { uploads } = sandbox.paths("t1");

    expect(uploaded).toBe(join(uploads, "a.txt"));
    expect(await readFile(uploaded, "utf8")).toBe("x");
  });

  test("says it is awake, has no desktop and opens a shell in the thread's folder", async () => {
    const { sandbox } = await runner();
    await sandbox.acquire({ id: "t1" });

    expect(sandbox.computerState("t1")).toBe("awake");
    expect(sandbox.desktop()).toBeUndefined();
    const shell = sandbox.shell("t1", "s1");
    expect(shell.env.AVEN_THREAD_DIR).toBe(sandbox.paths("t1").workspace);
  });
});
