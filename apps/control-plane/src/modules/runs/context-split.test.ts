import { expect, test } from "bun:test";

import { withContextSplit } from "./context-split";

const usage = {
  totals: { inputTokens: 10, outputTokens: 1, cacheWriteTokens: 0, cacheReadTokens: 0 },
  context: { usedTokens: 300, contextWindow: 1000 },
};
const split = { usedTokens: 300, segments: [{ id: "messages", tokens: 300 }] } as const;

test("the saved split comes back onto the context it was made for", () => {
  expect(withContextSplit(usage, { ...split, segments: [...split.segments] }).context).toEqual({
    usedTokens: 300,
    contextWindow: 1000,
    segments: [{ id: "messages", tokens: 300 }],
  });
});

test("a split saved for another turn is not shown against this one", () => {
  expect(
    withContextSplit(usage, { usedTokens: 120, segments: [{ id: "messages", tokens: 120 }] }),
  ).toBe(usage);
});

test("nothing saved, or no context to attach it to, leaves the usage as it is", () => {
  expect(withContextSplit(usage, null)).toBe(usage);
  const bare = { totals: usage.totals };
  expect(withContextSplit(bare, { usedTokens: 1, segments: [] })).toBe(bare);
});
