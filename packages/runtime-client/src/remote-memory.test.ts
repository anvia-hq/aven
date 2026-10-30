import { describe, expect, test } from "bun:test";
import type { MemoryCompactionMessage } from "@anvia/core";

import { createRemoteMemory } from "./remote-memory";

describe("createRemoteMemory compaction", () => {
  test("snapshot and replacePrefix are calls home scoped to the run", async () => {
    const calls: Array<{ method: string; params: unknown }> = [];
    const memory = createRemoteMemory(async (method, params) => {
      calls.push({ method, params });
      return method === "memory.snapshot"
        ? { revision: "r1", messages: [] }
        : { status: "committed" };
    }, "run-1");
    const scope = { sessionId: "ignored" } as never;

    expect(await memory.compaction?.snapshot({ scope })).toEqual({ revision: "r1", messages: [] });
    const replacement = {
      role: "system",
      content: "summary",
    } as unknown as MemoryCompactionMessage;
    const result = await memory.compaction?.replacePrefix({
      scope,
      revision: "r1",
      messageCount: 4,
      replacement,
      runId: "ignored",
    });

    expect(result).toEqual({ status: "committed" });
    expect(calls).toEqual([
      { method: "memory.snapshot", params: { runId: "run-1" } },
      {
        method: "memory.replacePrefix",
        params: { runId: "run-1", revision: "r1", messageCount: 4, replacement },
      },
    ]);
  });
});
