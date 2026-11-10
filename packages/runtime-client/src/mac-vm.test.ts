import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { guestScript, MacVm, syntheticConf } from "./mac-vm";
import { fakeTart } from "./testing/fake-tart";

let root: string;
let tart: Awaited<ReturnType<typeof fakeTart>>;
const saved = process.env.FAKE_TART_STATE;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aven-mac-vm-"));
  tart = await fakeTart(root);
  process.env.FAKE_TART_STATE = tart.state;
});

afterEach(async () => {
  if (saved === undefined) delete process.env.FAKE_TART_STATE;
  else process.env.FAKE_TART_STATE = saved;
  await rm(root, { recursive: true, force: true });
});

const vmOf = (name = "t1", extra: { connectTimeoutMs?: number } = {}) =>
  new MacVm({ bin: tart.bin, name, base: "base", pollMs: 20, ...extra });

describe("the commands the guest is given", () => {
  test("a script exports the environment, enters the workspace and runs the command exactly", () => {
    expect(
      guestScript({
        argv: ["/bin/bash", "-c", "echo 'hi' && ls"],
        inside: "app/src",
        env: { TOKEN: "it's secret" },
        id: "run-1",
      }),
    ).toBe(
      [
        "find /tmp -maxdepth 1 -name '.aven-run-*.pid' -mmin +120 -delete 2>/dev/null",
        "export TOKEN='it'\\''s secret'",
        "cd '/workspace/app/src' || exit 1",
        "echo $$ > /tmp/.aven-run-run-1.pid",
        "exec /usr/bin/perl -e 'setpgrp(0, 0); exec @ARGV or die \"$!\\n\"' -- '/bin/bash' '-c' 'echo '\\''hi'\\'' && ls'",
        "",
      ].join("\n"),
    );
  });

  test("the guest gets one link at the root for each folder the agent knows", () => {
    expect(syntheticConf()).toBe(
      [
        "workspace\tVolumes/My Shared Files/workspace",
        "uploads\tVolumes/My Shared Files/uploads",
        "skills\tVolumes/My Shared Files/skills",
        "",
      ].join("\n"),
    );
  });
});

describe("a macOS VM", () => {
  test("is cloned from its image once, comes up with its folders shared, and runs commands", async () => {
    const vm = vmOf();
    const workspace = join(root, "ws");
    await mkdir(workspace);
    await vm.start([{ name: "workspace", dir: workspace }]);
    expect(vm.running).toBe(true);

    await writeFile(join(workspace, "hello.txt"), "from the host");
    const run = await vm.exec(
      [],
      guestScript({ argv: ["/bin/cat", "hello.txt"], inside: ".", id: "run-2" }),
    );
    expect(run).toMatchObject({ code: 0, stdout: "from the host" });

    await vm.stop();
    expect(vm.running).toBe(false);
    const calls = await readFile(join(tart.state, "calls.log"), "utf8");
    expect(calls.match(/^clone base t1$/gm)).toHaveLength(1);
    expect(calls).toContain("run --no-graphics --dir=workspace:" + workspace + " t1");
  });

  test("keeps its disk when stopped, so waking it again does not clone", async () => {
    const vm = vmOf();
    await vm.start([]);
    await vm.stop();
    await vm.start([]);
    await vm.stop();
    const calls = await readFile(join(tart.state, "calls.log"), "utf8");
    expect(calls.match(/^clone /gm)).toHaveLength(1);
  });

  test("a folder shared read-only is marked so", async () => {
    const vm = vmOf();
    await vm.start([{ name: "uploads", dir: join(root, "up"), readOnly: true }]);
    await vm.stop();
    expect(await readFile(join(tart.state, "calls.log"), "utf8")).toContain(
      `--dir=uploads:${join(root, "up")}:ro`,
    );
  });

  test("reports why it could not start when the VM tool stops at once", async () => {
    await writeFile(join(tart.state, "fail-run"), "");
    await expect(vmOf().start([])).rejects.toThrow("Virtualization failed");
  });

  test("gives up, and stops the VM, when it does not come up in time", async () => {
    process.env.FAKE_TART_BOOT_SECONDS = "1";
    try {
      await expect(vmOf("slow", { connectTimeoutMs: 300 }).start([])).rejects.toThrow(
        "did not come up in 0.3 seconds",
      );
    } finally {
      delete process.env.FAKE_TART_BOOT_SECONDS;
    }
  }, 10_000);

  test("an image that is not there cannot be cloned, and the error says which", async () => {
    const vm = new MacVm({ bin: tart.bin, name: "x", base: "missing", pollMs: 20 });
    await expect(vm.start([])).rejects.toThrow("Could not create the macOS VM from missing");
  });

  test("remove stops the VM and deletes it", async () => {
    const vm = vmOf();
    await vm.start([]);
    await vm.remove();
    expect(await vm.exists()).toBe(false);
  });
});
