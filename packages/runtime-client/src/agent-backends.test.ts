import { describe, expect, test } from "bun:test";

import { backendFor, openAgentBackends } from "./agent-backends";
import { codexFakeQuery, codexQueryForProcess } from "./codex-fake";
import { journalPath } from "./testing/journal-path";
import type { AgentBackend } from "./types";

const installedBackend = (kind: string) => Promise.resolve({ kind } as unknown as AgentBackend);

describe("backendFor (decision 0220)", () => {
  const native = installedBackend("native");
  const installed = new Map([["native", native]]);

  test("uses native when a run names none, as a control plane from before does", async () => {
    expect(await backendFor(installed, undefined)).toBe(await native);
  });

  test("uses the backend the run names", async () => {
    const other = installedBackend("other");
    const both = new Map<string, Promise<AgentBackend>>([
      ["native", native],
      ["other", other],
    ]);

    expect(await backendFor(both, "native")).toBe(await native);
    expect(await backendFor(both, "other")).toBe(await other);
  });

  test("refuses a backend this runner does not drive, rather than using native", async () => {
    await expect(backendFor(installed, "other")).rejects.toThrow(
      "This runner does not drive the other agent backend",
    );
    await expect(backendFor(installed, "")).rejects.toThrow(
      "This runner does not drive that agent backend",
    );
  });

  test("a runner offers native, Claude and Codex", async () => {
    const opened = openAgentBackends(journalPath(), new Set());
    expect(opened.offered).toEqual(["native", "claude", "codex"]);
    expect((await opened.get("codex")).kind).toBe("codex");
    expect((await opened.get("native")).kind).toBe("native");
    await opened.close();
  });

  test("AVEN_CODEX_FAKE selects the fake Codex query", () => {
    const previous = process.env.AVEN_CODEX_FAKE;
    process.env.AVEN_CODEX_FAKE = "1";
    expect(codexQueryForProcess()).toBe(codexFakeQuery);
    process.env.AVEN_CODEX_FAKE = "0";
    expect(codexQueryForProcess()).not.toBe(codexFakeQuery);

    if (previous === undefined) delete process.env.AVEN_CODEX_FAKE;
    else process.env.AVEN_CODEX_FAKE = previous;
  });
});
