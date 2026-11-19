import { expect, test } from "bun:test";

import { contextBars } from "./context-bars";

test("the segments come in the order of the request, each sized against the whole window", () => {
  const split = contextBars({
    usedTokens: 300,
    contextWindow: 1000,
    segments: [
      { id: "messages", tokens: 150 },
      { id: "instructions", tokens: 100 },
      { id: "tools", tokens: 50 },
    ],
  });

  expect(split?.bars.map((bar) => [bar.label, bar.percent])).toEqual([
    ["System prompt", 10],
    ["Tool definitions", 5],
    ["Messages", 15],
  ]);
  expect(split?.free).toBe(700);
});

test("there is no split to draw without segments or without a known window", () => {
  expect(contextBars({ usedTokens: 300, contextWindow: 1000 })).toBeNull();
  expect(contextBars({ usedTokens: 300, contextWindow: 1000, segments: [] })).toBeNull();
  expect(contextBars({ usedTokens: 300, segments: [{ id: "messages", tokens: 300 }] })).toBeNull();
});

test("a segment with no tokens is left out", () => {
  const split = contextBars({
    usedTokens: 100,
    contextWindow: 1000,
    segments: [
      { id: "documents", tokens: 0 },
      { id: "messages", tokens: 100 },
    ],
  });

  expect(split?.bars.map((bar) => bar.id)).toEqual(["messages"]);
});
