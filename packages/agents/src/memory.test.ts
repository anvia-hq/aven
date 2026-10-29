import { afterAll, describe, expect, test } from "bun:test";

import type { MemoryStore, Message } from "@anvia/core";

import { createMemoryStore, withoutStoredReasoning } from "./memory";

// Needs the migrated Postgres from DATABASE_URL; skipped when there is none.
const run = process.env.DATABASE_URL ? describe : describe.skip;

run("memory store (postgres)", async () => {
  const { db } = await import("@aven/db/client");
  const store = createMemoryStore(db);
  const suffix = crypto.randomUUID();
  const scope = (organizationId: string) => ({
    sessionId: `test-thread-${suffix}`,
    metadata: { organizationId },
  });

  afterAll(async () => {
    await store.clear({ scope: scope("org-a") });
    await store.clear({ scope: scope("org-b") });
  });

  test("the migrated tables pass validation", async () => {
    await store.validate();
  });

  test("appended messages load back in order", async () => {
    await store.append({
      scope: scope("org-a"),
      runId: "run-1",
      turn: 1,
      messages: [
        { role: "user", content: "remember 42" },
        { role: "assistant", content: "ok" },
      ],
    });
    await store.append({
      scope: scope("org-a"),
      runId: "run-2",
      turn: 1,
      messages: [{ role: "user", content: "what number?" }],
    });
    const loaded = await store.load({ scope: scope("org-a") });
    expect(loaded.map((message) => message.content)).toEqual(["remember 42", "ok", "what number?"]);
  });

  test("the same session id in another organization sees nothing", async () => {
    expect(await store.load({ scope: scope("org-b") })).toEqual([]);
  });

  test("clear removes the history", async () => {
    await store.clear({ scope: scope("org-a") });
    expect(await store.load({ scope: scope("org-a") })).toEqual([]);
  });
});

describe("withoutStoredReasoning", () => {
  const reasoning = {
    type: "reasoning" as const,
    text: "",
    details: [{ type: "text" as const, text: "", signature: "sig" }],
  };
  const call = { type: "tool-call" as const, toolCallId: "c1", toolName: "lookup", input: {} };
  const history: Message[] = [
    { role: "user", content: "hi" },
    { role: "assistant", content: [reasoning, call] },
    { role: "assistant", content: [reasoning] },
    { role: "assistant", content: "plain" },
  ];

  function fakeStore() {
    const calls: string[] = [];
    const store: MemoryStore = {
      load: async () => history,
      append: async () => void calls.push("append"),
      clear: async () => void calls.push("clear"),
    };
    return { store, calls };
  }

  test("leaves thinking out of the history a run starts from, and the rest as it was", async () => {
    const loaded = await withoutStoredReasoning(fakeStore().store).load({
      scope: { sessionId: "s", metadata: {} },
    });

    expect(loaded).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: [call] },
      { role: "assistant", content: "plain" },
    ]);
  });

  test("what a run saves is saved as it is, including its thinking", async () => {
    const { store, calls } = fakeStore();
    const wrapped = withoutStoredReasoning(store);

    await wrapped.append({
      scope: { sessionId: "s", metadata: {} },
      runId: "r",
      turn: 1,
      messages: history,
    });
    await wrapped.clear({ scope: { sessionId: "s", metadata: {} } });

    expect(calls).toEqual(["append", "clear"]);
  });
});
