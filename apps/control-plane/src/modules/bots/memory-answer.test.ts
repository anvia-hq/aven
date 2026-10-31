import { describe, expect, test } from "bun:test";
import type { MemoryScope, MemoryStore, Message } from "@anvia/core";

import { answerBotMemory } from "./memory-answer";

const scope: MemoryScope = { sessionId: "bot-1", userId: "u1" };
const message = (text: string): Message => ({ role: "user", content: [{ type: "text", text }] });

// A store that remembers the scope each call used; one that cannot summarize has no `compaction`.
function recordingStore(compaction = true) {
  const used: { op: string; scope: MemoryScope }[] = [];
  const store: MemoryStore = {
    load: async (options) => (used.push({ op: "load", scope: options.scope }), [message("old")]),
    append: async (options) => void used.push({ op: "append", scope: options.scope }),
    clear: async (options) => void used.push({ op: "clear", scope: options.scope }),
  };
  if (compaction) {
    Object.assign(store, {
      compaction: {
        snapshot: async (options: { scope: MemoryScope }) => (
          used.push({ op: "snapshot", scope: options.scope }),
          { revision: "r1", messages: [] }
        ),
        replacePrefix: async (options: { scope: MemoryScope }) => (
          used.push({ op: "replacePrefix", scope: options.scope }),
          { status: "committed" as const }
        ),
      },
    });
  }
  return { store, used };
}

describe("answerBotMemory", () => {
  test("every operation is on the bot's own scope, whatever scope the runner might have named", async () => {
    const { store, used } = recordingStore();
    const answer = answerBotMemory(store, scope);

    expect(await answer({ replyId: "r1", op: "load" })).toEqual([message("old")]);
    expect(
      await answer({ replyId: "r1", op: "append", runId: "x", turn: 1, messages: [] }),
    ).toBeNull();
    expect(await answer({ replyId: "r1", op: "snapshot" })).toEqual({
      revision: "r1",
      messages: [],
    });
    expect(
      await answer({
        replyId: "r1",
        op: "replacePrefix",
        runId: "x",
        revision: "r1",
        messageCount: 2,
        replacement: message("summary"),
      }),
    ).toEqual({ status: "committed" });

    expect(used.map((call) => call.op)).toEqual(["load", "append", "snapshot", "replacePrefix"]);
    for (const call of used) expect(call.scope).toBe(scope);
  });

  test("what the runner appends is what the store gets", async () => {
    const appended: Message[][] = [];
    const store: MemoryStore = {
      load: async () => [],
      append: async ({ messages }) => void appended.push(messages),
      clear: async () => undefined,
    };
    await answerBotMemory(
      store,
      scope,
    )({
      replyId: "r1",
      op: "append",
      runId: "x",
      turn: 1,
      messages: [message("hi")],
    });
    expect(appended).toEqual([[message("hi")]]);
  });

  test("a store that cannot summarize says so", async () => {
    const { store } = recordingStore(false);
    await expect(answerBotMemory(store, scope)({ replyId: "r1", op: "snapshot" })).rejects.toThrow(
      "cannot be summarized",
    );
  });
});
