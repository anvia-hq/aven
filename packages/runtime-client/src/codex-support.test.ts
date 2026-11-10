import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { codexSupportFromEnv } from "./codex-support";

const home = mkdtempSync(join(tmpdir(), "codex-support-"));
afterAll(() => rmSync(home, { recursive: true, force: true }));

describe("codexSupportFromEnv", () => {
  test("a runner with no Codex installed offers none, so it does not say it can run it", () => {
    expect(codexSupportFromEnv({}, home, () => null)).toBeUndefined();
  });

  test("Codex is found on the PATH, and AVEN_CODEX_PATH says which one when it is set", () => {
    expect(codexSupportFromEnv({}, home, () => "/usr/bin/codex")?.path).toBe("/usr/bin/codex");
    expect(
      codexSupportFromEnv({ AVEN_CODEX_PATH: "/opt/codex" }, home, () => "/usr/bin/codex")?.path,
    ).toBe("/opt/codex");
  });

  test("its thread ids and its scratch folders live in the runner's own home, not in the workspace", () => {
    const support = codexSupportFromEnv({}, home, () => "/usr/bin/codex")!;
    expect(support.work).toBe(join(home, "codex-work"));
    support.threads.set("t1", "cx-1");
    expect(codexSupportFromEnv({}, home, () => "/usr/bin/codex")?.threads.get("t1")).toBe("cx-1");
  });
});
