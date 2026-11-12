import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { claudeExecutable } from "./claude-binary";

const live = process.env.AVEN_CLAUDE_DOWNLOAD_TEST === "1" ? describe : describe.skip;

live("the Claude binary from the npm registry", () => {
  test("downloads for this machine, matches its checksum and runs", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aven-claude-live-"));
    const path = await claudeExecutable({ dir, bundled: () => undefined });
    expect(path.startsWith(dir)).toBe(true);
    const child = Bun.spawn([path, "--version"], { stdout: "pipe", stderr: "pipe" });
    const [code, out] = await Promise.all([child.exited, new Response(child.stdout).text()]);
    expect(code).toBe(0);
    expect(out).toMatch(/\d+\.\d+/);
  }, 600_000);
});
