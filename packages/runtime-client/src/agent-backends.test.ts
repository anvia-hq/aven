import { describe, expect, test } from "bun:test";

import { backendFor } from "./agent-backends";
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
});
