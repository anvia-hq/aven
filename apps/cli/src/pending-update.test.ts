import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";

import { finish, updateStep } from "./commands/update";
import {
  clearPendingUpdate,
  pendingUpdateFile,
  readPendingUpdate,
  writePendingUpdate,
} from "./pending-update";

let home: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "aven-pending-"));
});
afterEach(() => rm(home, { recursive: true, force: true }));

test("the marker says which release an update was installing when it stopped", async () => {
  const file = pendingUpdateFile(home);
  expect(file).toBe(join(home, "update-pending.json"));
  expect(await readPendingUpdate(file)).toBeUndefined();

  await writePendingUpdate(file, {
    from: "0.2.0",
    to: "0.3.0",
    binary: "/usr/local/bin/aven",
    at: "2025-01-01T00:00:00.000Z",
  });
  expect(await readPendingUpdate(file)).toEqual({
    from: "0.2.0",
    to: "0.3.0",
    binary: "/usr/local/bin/aven",
    at: "2025-01-01T00:00:00.000Z",
  });
  expect((await stat(file)).mode & 0o777).toBe(0o600);

  await clearPendingUpdate(file);
  expect(await readPendingUpdate(file)).toBeUndefined();
});

test("a file that says nothing about a release is no marker", async () => {
  const file = pendingUpdateFile(home);
  await writeFile(file, "not a marker");
  expect(await readPendingUpdate(file)).toBeUndefined();
  await writeFile(file, JSON.stringify({ from: "0.2.0", binary: "/usr/local/bin/aven" }));
  expect(await readPendingUpdate(file)).toBeUndefined();
});

test("an update that stopped after the swap finishes next time, though the version matches", () => {
  expect(
    updateStep({ version: "0.3.0", wanted: "0.3.0", force: false, pending: { to: "0.3.0" } }),
  ).toBe("finish");
});

test("with nothing pending it either replaces the binary or says it is up to date", () => {
  expect(updateStep({ version: "0.3.0", wanted: "0.3.0", force: false, pending: undefined })).toBe(
    "current",
  );
  expect(updateStep({ version: "0.3.0", wanted: "0.3.0", force: true, pending: undefined })).toBe(
    "replace",
  );
  expect(updateStep({ version: "0.2.0", wanted: "0.3.0", force: false, pending: undefined })).toBe(
    "replace",
  );
  expect(
    updateStep({ version: "0.3.0", wanted: "0.3.0", force: false, pending: { to: "0.2.0" } }),
  ).toBe("current");
});

test("finishing an update clears the marker it was started with", async () => {
  const previous = process.env.AVEN_HOME;
  process.env.AVEN_HOME = home;
  const log = spyOn(console, "log").mockImplementation(() => {});
  try {
    await writePendingUpdate(pendingUpdateFile(), {
      from: "0.2.0",
      to: "0.3.0",
      binary: "/usr/local/bin/aven",
    });
    expect(await readPendingUpdate(pendingUpdateFile())).toBeDefined();

    await finish();

    expect(await readPendingUpdate(pendingUpdateFile())).toBeUndefined();
    expect(log.mock.calls.map((call) => String(call[0])).join("\n")).toContain("is installed");
  } finally {
    log.mockRestore();

    if (previous === undefined) delete process.env.AVEN_HOME;
    else process.env.AVEN_HOME = previous;
  }
});
