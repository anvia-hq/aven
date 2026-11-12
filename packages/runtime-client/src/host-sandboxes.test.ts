import { afterEach, describe, expect, test } from "bun:test";
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AnyTool } from "@anvia/core";

import { HostSandboxes } from "./host-sandboxes";
import { createRemoteRepo } from "./testing/remote-repo";

const homes: string[] = [];
const sandboxes: HostSandboxes[] = [];

async function runner(dirs: string[] = []) {
  const home = await mkdtemp(join(tmpdir(), "aven-host-"));
  homes.push(home);
  const sandbox = await HostSandboxes.start({ home, dirs });
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

describe("a bot's computer", () => {
  test("is a folder under bots/ of the runner's home, and a thread's stays under workspaces/", async () => {
    const { sandbox, home } = await runner();

    const box = await sandbox.acquire({ id: "b1", bot: true });
    await box.start?.();
    await sandbox.acquire({ id: "t1" }, undefined);

    expect(sandbox.paths("b1").workspace).toBe(join(home, "bots", "b1"));
    expect(sandbox.paths("t1").workspace).toBe(join(home, "workspaces", "t1"));
    await expect(lstat(join(home, "workspaces", "b1"))).rejects.toThrow();
  });

  test("a reply and a wake arriving together move the old folder once, and both succeed", async () => {
    const { sandbox, home } = await runner();
    await mkdir(join(home, "workspaces", "b1"), { recursive: true });
    await writeFile(join(home, "workspaces", "b1", "notes.txt"), "kept");

    await Promise.all([
      sandbox.acquire({ id: "b1", bot: true }),
      sandbox.acquire({ id: "b1", bot: true }),
      sandbox.acquire({ id: "b1", bot: true }),
    ]);

    expect(await readFile(join(home, "bots", "b1", "notes.txt"), "utf8")).toBe("kept");
    await expect(lstat(join(home, "workspaces", "b1"))).rejects.toThrow();
  });

  test("a folder a bot had under workspaces/ moves to bots/ on first use, with its files", async () => {
    const { sandbox, home } = await runner();
    await mkdir(join(home, "workspaces", "b1"), { recursive: true });
    await writeFile(join(home, "workspaces", "b1", "notes.txt"), "kept");

    expect(sandbox.paths("b1").workspace).toBe(join(home, "workspaces", "b1"));
    await sandbox.acquire({ id: "b1", bot: true });

    expect(sandbox.paths("b1").workspace).toBe(join(home, "bots", "b1"));
    expect(await readFile(join(home, "bots", "b1", "notes.txt"), "utf8")).toBe("kept");
    await expect(lstat(join(home, "workspaces", "b1"))).rejects.toThrow();
  });
});

describe("a runner that works on this machine", () => {
  test("clones the repository into a folder of the thread and tells the agent that real path", async () => {
    const { sandbox, home } = await runner();
    const { access } = await createRemoteRepo();

    const box = await sandbox.acquire({ id: "t1" }, async () => access);

    const paths = sandbox.paths("t1");
    expect(paths.workspace).toBe(join(home, "workspaces", "t1"));
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

  describe("a project that is a folder on the machine", () => {
    const folderOf = (dir: string) => async () => dir;

    test("works in its own clone of a git folder, on its own branch, which can be pushed back", async () => {
      const { dir } = await createRemoteRepo();
      const { sandbox } = await runner([dir]);

      const box = await sandbox.acquire({ id: "t1" }, undefined, { folder: folderOf(dir) });

      const { workspace } = sandbox.paths("t1");
      expect(await sandbox.workspace("t1")).toBe(workspace);
      const ran = await call(box.tools, "exec_command", {
        command:
          "git branch --show-current && echo edit > edit.txt && git add . && git -c user.name=a -c user.email=a@a commit -qm edit && git push -q origin HEAD",
      });
      expect(String(ran.stdout)).toContain("aven/t1");
      expect(ran.exitCode).toBe(0);
      const pushed = await Bun.$`git -C ${dir} show aven/t1:edit.txt`.text();
      expect(pushed).toBe("edit\n");
    });

    test("opens a shell that says what the thread's folder is, and whose prompt names the project", async () => {
      const { dir } = await createRemoteRepo();
      const { sandbox } = await runner([dir]);
      await sandbox.acquire({ id: "t1" }, undefined, { folder: folderOf(dir) });

      const shell = sandbox.shell("t1", "s1");
      const proc = Bun.spawn(shell.argv, {
        env: shell.env,
        stdin: new Blob(["pwd\nexit\n"]),
        stdout: "pipe",
        stderr: "pipe",
      });
      const out = await new Response(proc.stdout).text();

      expect(out).toContain(`its own copy of ${await realpath(dir)}`);
      expect(out).toContain("on branch aven/t1");
      expect(shell.env.AVEN_THREAD_DIR).toBe(sandbox.paths("t1").workspace);
    });

    test("works in place in a folder that is not a git repository", async () => {
      const dir = await mkdtemp(join(tmpdir(), "aven-plain-"));
      homes.push(dir);
      await writeFile(join(dir, "notes.txt"), "mine");
      const { sandbox } = await runner([dir]);

      const box = await sandbox.acquire({ id: "t1" }, undefined, { folder: folderOf(dir) });
      await call(box.tools, "write_file", {
        path: join(sandbox.paths("t1").workspace, "more.txt"),
        content: "agent",
      });

      expect((await lstat(sandbox.paths("t1").workspace)).isSymbolicLink()).toBe(true);
      expect(await readFile(join(dir, "more.txt"), "utf8")).toBe("agent");
      expect(await sandbox.workspace("t1")).toBe(await realpath(dir));
    });

    test("refuses to fork a thread in a folder that is not a git repository", async () => {
      const dir = await mkdtemp(join(tmpdir(), "aven-plain-"));
      homes.push(dir);
      const { sandbox } = await runner([dir]);
      await sandbox.acquire({ id: "parent" }, undefined, { folder: folderOf(dir) });

      await expect(
        sandbox.acquire({ id: "child", forkOf: "parent" }, undefined, { folder: folderOf(dir) }),
      ).rejects.toThrow("not a git repository");
    });

    test("refuses a folder it was not asked to serve", async () => {
      const { dir } = await createRemoteRepo();
      const { sandbox } = await runner([]);

      await expect(
        sandbox.acquire({ id: "t1" }, undefined, { folder: folderOf(dir) }),
      ).rejects.toThrow("does not serve");
    });

    test("forks a thread's clone, with what it has not committed", async () => {
      const { dir } = await createRemoteRepo();
      const { sandbox } = await runner([dir]);
      await sandbox.acquire({ id: "parent" }, undefined, { folder: folderOf(dir) });
      await writeFile(join(sandbox.paths("parent").workspace, "wip.txt"), "unsaved");

      await sandbox.acquire({ id: "child", forkOf: "parent" }, undefined, {
        folder: folderOf(dir),
      });

      expect(await readFile(join(sandbox.paths("child").workspace, "wip.txt"), "utf8")).toBe(
        "unsaved",
      );
    });

    test("lists the folders it serves", async () => {
      const { dir } = await createRemoteRepo();
      const { sandbox } = await runner([dir]);

      expect(sandbox.dirs).toEqual([await realpath(dir)]);
    });
  });
});
