import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { startDetachedUpdate, updateCommand } from "./detached-update";

test("the update command names the release it is asked for, and none means the latest", () => {
  expect(updateCommand("/usr/local/bin/aven", "0.5.4")).toEqual([
    "/usr/local/bin/aven",
    "update",
    "--release",
    "0.5.4",
  ]);
  expect(updateCommand("/usr/local/bin/aven", undefined)).toEqual([
    "/usr/local/bin/aven",
    "update",
  ]);
});

test.skipIf(process.platform === "linux")(
  "starts the update as a process of its own, with its output in update.log",
  async () => {
    const home = await mkdtemp(join(tmpdir(), "aven-update-"));
    try {
      const fake = join(home, "aven");
      await writeFile(fake, '#!/bin/sh\necho "ran $@ in $AVEN_HOME"\n', { mode: 0o755 });
      await startDetachedUpdate("0.5.4", home, fake);
      const log = join(home, "logs", "update.log");
      for (
        let i = 0;
        i < 50 && !((await Bun.file(log).exists()) && (await Bun.file(log).text()));
        i++
      )
        await Bun.sleep(40);
      expect(await Bun.file(log).text()).toBe(`ran update --release 0.5.4 in ${home}\n`);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  },
);
