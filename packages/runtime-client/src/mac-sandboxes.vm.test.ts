import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MacSandboxes } from "./mac-sandboxes";
import type { ThreadSandbox } from "./types";

const image = process.env.AVEN_MAC_TEST_IMAGE;
const suite = image ? describe : describe.skip;

type Exec = { status: string; exitCode?: number; stdout: string; stderr: string };

suite(
  "a macOS sandbox on a real VM (AVEN_MAC_TEST_IMAGE, optional AVEN_MAC_TEST_TART_HOME)",
  () => {
    let home: string;
    let sandboxes: MacSandboxes;
    let box: ThreadSandbox;

    const exec = async (command: string, timeoutMs = 120_000) => {
      const tool = box.tools.find((candidate) => candidate.name === "exec_command")!;
      return (await tool.call({ command, timeoutMs }, undefined as never)) as Exec;
    };

    afterAll(async () => {
      await sandboxes?.putAway("vm-test");
      await sandboxes?.dispose();
      if (home) await rm(home, { recursive: true, force: true });
    });

    test("starts, shares the workspace, runs commands, builds Swift and cleans up what it starts", async () => {
      home = await mkdtemp(join(tmpdir(), "aven-mac-vm-test-"));
      sandboxes = await MacSandboxes.start({
        base: image!,
        tartHome: process.env.AVEN_MAC_TEST_TART_HOME,
        home,
        connectTimeoutMs: 300_000,
      });
      box = await sandboxes.acquire({ id: "vm-test" });
      const write = box.tools.find((candidate) => candidate.name === "write_file")!;
      await write.call(
        { path: "/workspace/App/main.swift", content: 'print("hello from swift")\n' },
        undefined as never,
      );

      const links = await exec("ls -d /workspace /uploads /skills && cd /workspace && pwd -P");
      expect(links).toMatchObject({ status: "exited", exitCode: 0 });
      expect(links.stdout).toContain("/Volumes/My Shared Files/workspace");

      const built = await exec("cd /workspace/App && swiftc main.swift -o hello && ./hello");
      expect(built).toMatchObject({ exitCode: 0, stdout: "hello from swift\n" });
      expect(
        await readFile(join(home, "workspaces", "vm-test", "App", "hello")).catch(() => null),
      ).not.toBeNull();

      expect(await exec("echo oops >&2; exit 3")).toMatchObject({ exitCode: 3, stderr: "oops\n" });
    }, 600_000);

    test("a command that times out does not keep running in the VM", async () => {
      const timedOut = await exec("exec sleep 321", 3000);
      expect(timedOut.status).toBe("timed_out");
      await Bun.sleep(3500);
      expect((await exec("pgrep -f 'sleep 321' || echo none")).stdout).toBe("none\n");
    }, 120_000);
  },
);
