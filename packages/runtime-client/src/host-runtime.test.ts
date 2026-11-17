import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { git } from "./git-clone";
import { startHostRuntime } from "./host-runtime";
import { fakeControlPlane } from "./testing/fake-control-plane";
import { createRemoteRepo } from "./testing/remote-repo";

const cleanups: (() => unknown)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

const until = async (condition: () => boolean) => {
  for (let i = 0; i < 250 && !condition(); i++) await Bun.sleep(20);
  expect(condition()).toBe(true);
};

describe("a runner on this machine", () => {
  test("clones the repository the control plane asks for, and says which folder it is in", async () => {
    const { dir } = await createRemoteRepo();
    const home = await realpath(await mkdtemp(join(tmpdir(), "aven-host-runtime-")));
    const plane = fakeControlPlane();
    const runtime = await startHostRuntime({
      base: plane.url.replace(/^ws/, "http"),
      token: "avrt_test",
      home,
      dirs: [],
      git: (args, options) =>
        git(
          args.map((arg) => (arg === "https://github.com/acme/app.git" ? dir : arg)),
          options,
        ),
    });
    cleanups.push(() => runtime.stop(), plane.stop);

    await runtime.ready;
    plane.send({
      type: "call",
      id: "clone-1",
      method: "folders.clone",
      params: { repository: "acme/app" },
    });
    await until(() => plane.received.some((m) => m.type === "reply" && m.id === "clone-1"));

    const reply = plane.received.find((m) => m.type === "reply" && m.id === "clone-1");
    expect(reply).toMatchObject({
      ok: true,
      result: { path: join(home, "repos", "github.com", "acme", "app") },
    });
  });
});
