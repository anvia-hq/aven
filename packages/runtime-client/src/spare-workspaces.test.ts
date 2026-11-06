import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Environments } from "./environments";
import { git } from "./git-clone";
import { gitFixture, sh } from "./testing/git-fixture";

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

// A repository with a snapshot of its environment, and the runner's `Environments` over it: Docker
// only has to name the sandbox image, and the git is the real one over a local remote.
async function setup() {
  const fixture = await gitFixture();
  const home = await mkdtemp(join(tmpdir(), "aven-spares-"));
  cleanups.push(fixture.cleanup, () => rm(home, { recursive: true, force: true }));
  const environments = new Environments({
    image: "aven-sandbox:dev",
    runner: "r1",
    memoryMb: 1024,
    cpus: 1,
    pidsLimit: 64,
    home,
    docker: async () => ({ code: 0, stdout: "sha256:base\n", stderr: "" }),
    git,
    spareDelayMs: 0,
  });
  const thread = (id: string) => ({ id, organizationId: "org-1" });
  const key = environments.snapshots.keyFor("org-1", fixture.access.cloneUrl);
  // What a setup left: dependencies, which git ignores.
  await writeFile(join(fixture.root, ".gitignore"), "node_modules/\n");
  await mkdir(join(fixture.root, "node_modules"));
  await writeFile(join(fixture.root, "node_modules", "dep.js"), "x\n");
  await sh(fixture.root, "add", ".gitignore");
  await sh(fixture.root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "ignore");
  await sh(fixture.root, "push", "-q", "origin", "HEAD:main");
  const snapshot = await environments.snapshots.publish(key, {
    image: "aven-env-test",
    baseImageId: "sha256:base",
    workspace: fixture.root,
  });
  const empty = async () => {
    const dir = await mkdtemp(join(tmpdir(), "aven-spare-root-"));
    cleanups.push(() => rm(dir, { recursive: true, force: true }));
    return dir;
  };
  return { ...fixture, environments, home, key, snapshot, thread, empty };
}

describe("a spare workspace (decision 0128)", () => {
  test("is prepared once a thread has its own, from the snapshot, and the next thread takes it", async () => {
    const { environments, access, home, key, thread, empty } = await setup();
    const spare = join(home, "spares", key);
    expect(await exists(spare)).toBe(false);

    const first = await empty();
    await environments.fill(thread("11111111-aaaa"), first, access);
    await environments.settled();
    expect(await exists(join(spare, "workspace", "node_modules", "dep.js"))).toBe(true);

    // A mark inside the spare's `.git`, which a restore would not have: the second thread has it.
    await writeFile(join(spare, "workspace", ".git", "spare-mark"), "mine");
    const second = await empty();
    await environments.fill(thread("22222222-bbbb"), second, access);

    expect(await readFile(join(second, ".git", "spare-mark"), "utf8")).toBe("mine");
    expect(await Bun.file(join(second, "node_modules", "dep.js")).exists()).toBe(true);
    // It is the thread's own now: on its branch, brought up to date, and no longer spare.
    expect(await sh(second, "rev-parse", "--abbrev-ref", "HEAD")).toBe("aven/22222222");
    expect(await sh(second, "status", "--porcelain")).toBe("");
    // The next thread's is prepared after that one's.
    await environments.settled();
    expect(await exists(join(spare, "workspace"))).toBe(true);
    expect(await exists(join(spare, "workspace", ".git", "spare-mark"))).toBe(false);
  });

  test("is not used when the snapshot it was made from has been replaced", async () => {
    const { environments, access, home, key, snapshot, thread, empty } = await setup();
    await environments.fill(thread("11111111-aaaa"), await empty(), access);
    await environments.settled();
    const spare = join(home, "spares", key);
    await writeFile(join(spare, "workspace", ".git", "spare-mark"), "old");
    await writeFile(join(spare, "meta.json"), JSON.stringify({ snapshotCreatedAt: "2000-01-01" }));
    expect(snapshot.createdAt).not.toBe("2000-01-01");

    const second = await empty();
    await environments.fill(thread("22222222-bbbb"), second, access);

    expect(await Bun.file(join(second, ".git", "spare-mark")).exists()).toBe(false);
    expect(await Bun.file(join(second, "node_modules", "dep.js")).exists()).toBe(true);
  });

  test("keeps only a few repositories' spares, the oldest going first", async () => {
    const { environments, access, home, key, thread, empty } = await setup();
    const spares = join(home, "spares");
    await mkdir(spares, { recursive: true });
    for (const [index, name] of ["old-1", "old-2", "old-3"].entries()) {
      await mkdir(join(spares, name), { recursive: true });
      const at = new Date(Date.now() - (10 - index) * 60_000);
      await import("node:fs/promises").then(({ utimes }) => utimes(join(spares, name), at, at));
    }

    await environments.fill(thread("11111111-aaaa"), await empty(), access);
    await environments.settled();

    expect(await exists(join(spares, key))).toBe(true);
    expect(await exists(join(spares, "old-1"))).toBe(false);
    expect(await exists(join(spares, "old-2"))).toBe(true);
    expect(await exists(join(spares, "old-3"))).toBe(true);
  });
});
