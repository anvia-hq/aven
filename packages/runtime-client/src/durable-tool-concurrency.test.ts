import { DurableRuntime, type DurableAgentRegistration } from "@anvia/durable";
import { SqliteDurableStore } from "@anvia/durable/sqlite";
import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  assertDurableToolConcurrency,
  TOOL_CONCURRENCY_NOT_HONOURED,
} from "./durable-tool-concurrency";
import type { ToolConcurrencyProbe } from "./types";

const patched: ToolConcurrencyProbe = (registration: DurableAgentRegistration) => {
  const value = registration.toolConcurrency;

  if (value === undefined) return;

  if (!Number.isSafeInteger(value) || value < 1)
    throw new TypeError("Durable toolConcurrency must be a positive integer.");
};

const unpatched: ToolConcurrencyProbe = () => {};

test("a durable build that validates toolConcurrency passes the check", () => {
  expect(() => assertDurableToolConcurrency(patched)).not.toThrow();
});

test("a durable build that drops toolConcurrency fails the check and says how to fix it", () => {
  const check = () => assertDurableToolConcurrency(unpatched);
  expect(check).toThrow(TOOL_CONCURRENCY_NOT_HONOURED);
  expect(check).toThrow(/bun install/);
  expect(check).toThrow(/patchedDependencies/);
  expect(check).toThrow(/patches\/@anvia%2Fdurable@0\.14\.0\.patch/);
});

test("a durable build that fails another way reports its own error", () => {
  const broken: ToolConcurrencyProbe = () => {
    throw new Error("The run journal is unavailable.");
  };
  expect(() => assertDurableToolConcurrency(broken)).toThrow("The run journal is unavailable.");
});

test("the installed @anvia/durable honours toolConcurrency", async () => {
  const dir = mkdtempSync(join(tmpdir(), "aven-durable-"));
  const runtime = await DurableRuntime.open({
    store: new SqliteDurableStore(join(dir, "runs.db")),
  });
  try {
    expect(() =>
      assertDurableToolConcurrency((registration) => runtime.registerAgents([registration])),
    ).not.toThrow();
  } finally {
    await runtime.close();
  }
});
