import { describe, expect, test } from "bun:test";

import { continuationPrompt, turnsThatFit } from "./continuation";

const turn = (role: "user" | "assistant", text: string) => ({ role, text });
const base = {
  oldTitle: "Pager",
  oldBranch: "aven/aaaa1111",
  newBranch: "aven/bbbb2222",
  runnerName: "big-box",
  earlier: 0,
};

describe("a thread continued on another runner (decision 0149)", () => {
  test("starts with one line for the person, and tells the agent how to bring the changes over", () => {
    const text = continuationPrompt({
      ...base,
      turns: [turn("user", "Add a pager"), turn("assistant", "Half done")],
      patch: "attached",
    });
    expect(text.split("\n")[0]).toBe('[continued] Continued from "Pager", now on big-box');
    expect(text).toContain("git apply --3way /uploads/previous-thread.patch");
    expect(text).toContain("Person: Add a pager");
    expect(text).toContain("Agent: Half done");
    expect(text).not.toContain("earlier turns");
  });

  test("says what is missing when the changes did not come, or there were none", () => {
    const turns = [turn("user", "hi")];
    expect(continuationPrompt({ ...base, turns, patch: "unavailable" })).toContain(
      "git fetch origin aven/aaaa1111",
    );
    expect(continuationPrompt({ ...base, turns, patch: "none" })).toContain(
      "nothing to bring over",
    );
  });

  test("keeps the newest turns that fit and counts the ones it left out", () => {
    const turns = Array.from({ length: 12 }, (_, i) =>
      turn("assistant", `turn ${i} ${"x".repeat(1900)}`),
    );
    const kept = turnsThatFit(turns, 3);
    expect(kept.text).toContain("turn 11");
    expect(kept.text).not.toContain("turn 0 ");
    expect(kept.earlier).toBeGreaterThan(3);
    expect(kept.text.length).toBeLessThan(15_000);
  });
});
