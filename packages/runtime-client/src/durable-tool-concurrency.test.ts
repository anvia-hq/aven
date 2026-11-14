import { DurableRuntime } from "@anvia/durable";
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

const ignoring: ToolConcurrencyProbe = () => {};

test("a durable build that drops toolConcurrency fails the check and says how to fix it", () => {
  const check = () => assertDurableToolConcurrency(ignoring);
  expect(check).toThrow(TOOL_CONCURRENCY_NOT_HONOURED);
  expect(check).toThrow(/bun install/);
  expect(check).toThrow(/0.17.0 or later/);
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
