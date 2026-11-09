import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { BrowserProfiles } from "./browser-profiles";

const DAY = 24 * 60 * 60 * 1000;

describe("a person's browser profile in a project (decision 0180)", () => {
  let home = "";
  let clock = Date.parse("2026-01-01T00:00:00Z");
  const profiles = () => new BrowserProfiles({ home, keepMs: 90 * DAY, now: () => clock });
  const mine = (id: string) => ({ id, ownerId: "user-1", projectId: "project-1" });

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "aven-profiles-"));
    clock = Date.parse("2026-01-01T00:00:00Z");
  });
  afterEach(() => rm(home, { recursive: true, force: true }));

  test("two threads of one person in one project are given the same directory, one after the other", async () => {
    const kept = profiles();
    await kept.remember(mine("t1"));
    await kept.remember(mine("t2"));
    const first = await kept.lease("t1");
    expect(first?.shared).toBe(true);
    kept.release("t1");
    const second = await kept.lease("t2");
    expect(second?.dir).toBe(first?.dir);
    expect(((await stat(second!.dir)).mode & 0o777).toString(8)).toBe("700");
  });

  test("another person, or another project, has a profile of its own", async () => {
    const kept = profiles();
    await kept.remember(mine("t1"));
    await kept.remember({ id: "t2", ownerId: "user-2", projectId: "project-1" });
    await kept.remember({ id: "t3", ownerId: "user-1", projectId: "project-2" });
    const dirs = await Promise.all(
      ["t1", "t2", "t3"].map(async (id) => (await kept.lease(id))?.dir),
    );
    expect(new Set(dirs).size).toBe(3);
  });

  test("a thread that starts while another holds the profile gets a private one, as a browser cannot share it", async () => {
    const kept = profiles();
    await kept.remember(mine("t1"));
    await kept.remember(mine("t2"));
    const first = await kept.lease("t1");
    const second = await kept.lease("t2");
    expect(second?.shared).toBe(false);
    expect(second?.dir).not.toBe(first?.dir);
    expect(second?.name).toBe("t-t2");
    expect((await kept.lease("t1"))?.dir).toBe(first?.dir);
  });

  test("what a thread was started with is remembered when the runner has no thread to go by", async () => {
    await profiles().remember(mine("t1"));
    const later = await profiles().lease("t1");
    expect(later?.shared).toBe(true);
    const unknown = await profiles().lease("t9");
    expect(unknown?.shared).toBe(false);
  });

  test("a thread without a person or project, or a name that is not safe, gets nothing shared", async () => {
    const kept = profiles();
    await kept.remember({ id: "t1" });
    expect((await kept.lease("t1"))?.shared).toBe(false);
    expect(await kept.lease("../escape")).toBeUndefined();
  });

  test("a lock left by a container that was removed does not keep the browser out", async () => {
    const kept = profiles();
    await kept.remember(mine("t1"));
    const profile = await kept.lease("t1");
    await symlink("other-host-123", join(profile!.dir, "SingletonLock"));
    await writeFile(join(profile!.dir, "Cookies"), "kept");
    kept.release("t1");
    await kept.lease("t1");
    expect(await readdir(profile!.dir)).not.toContain("SingletonLock");
    expect(await readdir(profile!.dir)).toContain("Cookies");
  });

  test("a profile nobody used for the time it is kept is removed by the sweep, and a held or newer one is not", async () => {
    const kept = profiles();
    await kept.remember(mine("t1"));
    await kept.remember({ id: "t2", ownerId: "user-2", projectId: "project-1" });
    const old = await kept.lease("t1");
    kept.release("t1");
    clock += 91 * DAY;
    const held = await kept.lease("t2");
    expect(await kept.sweep()).toEqual([old!.name]);
    expect(await readdir(join(home, "browser-profiles"))).toContain(held!.name);
    expect(await readdir(join(home, "browser-profiles"))).not.toContain(old!.name);
  });

  test("a private profile goes with its thread, and keeping them for ever is a keep time of 0", async () => {
    const kept = profiles();
    await kept.remember(mine("t1"));
    await kept.remember(mine("t2"));
    await kept.lease("t1");
    const second = await kept.lease("t2");
    await kept.forget("t2");
    expect(await readdir(join(home, "browser-profiles"))).not.toContain(second!.name);

    const forever = new BrowserProfiles({ home, keepMs: 0, now: () => clock + 1000 * DAY });
    expect(await forever.sweep()).toEqual([]);
  });
});
