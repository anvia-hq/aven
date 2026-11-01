import { describe, expect, test } from "bun:test";

import { pauseMs, pickWord, WORDS } from "./working-words";

describe("pickWord", () => {
  test("is one of the words", () => {
    expect(WORDS).toContain(pickWord(undefined));
  });

  test("is never the word it follows, whatever the dice say", () => {
    for (const current of WORDS) {
      for (const roll of [0, 0.25, 0.5, 0.75, 0.999999]) {
        expect(pickWord(current, () => roll)).not.toBe(current);
      }
    }
  });

  test("reaches every other word", () => {
    const seen = new Set<string>();
    for (let step = 0; step < WORDS.length; step++) {
      seen.add(pickWord("Pondering", () => step / WORDS.length));
    }
    expect(seen.size).toBe(WORDS.length - 1);
  });
});

describe("pauseMs", () => {
  test("is between 2.5 and 5 seconds", () => {
    expect(pauseMs(() => 0)).toBe(2500);
    expect(pauseMs(() => 0.999999)).toBeLessThan(5000);
    expect(pauseMs(() => 0.5)).toBeGreaterThan(2500);
  });
});

test("the words are all different and each is one word", () => {
  expect(new Set(WORDS).size).toBe(WORDS.length);
  for (const word of WORDS) expect(word).toMatch(/^[A-Z][a-z]+$/);
});
