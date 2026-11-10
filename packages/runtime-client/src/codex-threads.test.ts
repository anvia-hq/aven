import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CodexThreads } from "./codex-threads";

const dir = mkdtempSync(join(tmpdir(), "codex-threads-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("CodexThreads", () => {
  test("remembers a thread's Codex id across a restart of the runner", () => {
    const file = join(dir, "a", "threads.json");
    const first = new CodexThreads(file);
    expect(first.get("t1")).toBeUndefined();
    first.set("t1", "codex-1");
    expect(new CodexThreads(file).get("t1")).toBe("codex-1");
  });

  test("forgets a thread, and that stays forgotten", () => {
    const file = join(dir, "b.json");
    const threads = new CodexThreads(file);
    threads.set("t1", "codex-1");
    threads.set("t2", "codex-2");
    threads.delete("t1");
    const reread = new CodexThreads(file);
    expect([reread.get("t1"), reread.get("t2")]).toEqual([undefined, "codex-2"]);
  });

  test("a file that is not what it was written as starts empty and does not stop the runner", () => {
    const file = join(dir, "c.json");
    writeFileSync(file, "{not json");
    expect(new CodexThreads(file).get("t1")).toBeUndefined();
    writeFileSync(file, JSON.stringify({ t1: 5, t2: "ok" }));
    const threads = new CodexThreads(file);
    expect([threads.get("t1"), threads.get("t2")]).toEqual([undefined, "ok"]);
  });
});
