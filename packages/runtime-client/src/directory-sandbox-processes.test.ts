import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DirectorySandbox } from "./directory-sandbox";
import { ProcessEndWatch } from "./process-end-watch";
import { threadProcesses } from "./thread-processes";
import type { RuntimeToControlPlane } from "@aven/protocol/types";

const folders: string[] = [];
const sandboxes: DirectorySandbox[] = [];

afterEach(async () => {
  await Promise.all(sandboxes.splice(0).map((sandbox) => sandbox.dispose()));
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true })));
});

async function open() {
  const folder = await mkdtemp(join(tmpdir(), "aven-processes-"));
  folders.push(folder);
  const sandbox = new DirectorySandbox("thread-1", folder);
  sandboxes.push(sandbox);
  return threadProcesses(sandbox as never, () => true);
}

test("a process in a later sandbox is not mistaken for one an earlier sandbox left running", async () => {
  const sent: RuntimeToControlPlane[] = [];
  let processes = await open();
  let running = true;
  const watch = new ProcessEndWatch({
    box: () => ({ processes }) as never,
    send: (message) => sent.push(message) > 0,
    hasRun: () => running,
    stopped: () => false,
    pollMs: 20,
  });
  await processes.start("sleep 30");
  await watch.arm("thread-1");
  processes = await open();
  await processes.start("echo done");
  running = false;
  watch.settle("thread-1");

  for (let i = 0; i < 100 && sent.length === 0; i++) await Bun.sleep(20);

  watch.cancelAll();
  expect(sent.map((message) => message.type)).toEqual(["process.ended"]);
});
