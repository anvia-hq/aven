import { describe, expect, test } from "bun:test";

import { MAX_SHIP_PROMPT_CHARS, ShipPromptError, shipPrompt } from "./prompt";

const where = { branch: "aven/abcdef12", base: "main" };
const text = (body: string, truncated = false) => ({
  kind: "text" as const,
  text: body,
  size: body.length,
  truncated,
});

describe("the prompt a Ship sends", () => {
  test("is Aven's own when the repository has no .aven/ship.md, or no workspace yet", () => {
    for (const file of [null, { kind: "missing" as const }]) {
      const prompt = shipPrompt(file, where);

      expect(prompt).toContain("gh pr create --draft");
      expect(prompt).toContain("git fetch origin main");
      expect(prompt).toContain("Never force-push to main");
      expect(prompt).toContain(
        "(This thread's branch is aven/abcdef12; the repository's default branch is main.)",
      );
    }
  });

  test("is the repository's own when it has one, as it is, then where the thread is", () => {
    const prompt = shipPrompt(
      text("  Rebase, run `bun test`, then open a PR with the template.\n"),
      where,
    );

    expect(prompt).toBe(
      "Rebase, run `bun test`, then open a PR with the template.\n\n(This thread's branch is aven/abcdef12; the repository's default branch is main.)",
    );
    expect(prompt).not.toContain("gh pr create --draft");
  });

  test("is Aven's own when the file is empty", () => {
    expect(shipPrompt(text("  \n"), where)).toContain("gh pr create --draft");
  });

  test("a custom prompt may be 10,000 characters and no more", () => {
    expect(() => shipPrompt(text("x".repeat(MAX_SHIP_PROMPT_CHARS)), where)).not.toThrow();
    expect(() => shipPrompt(text("x".repeat(MAX_SHIP_PROMPT_CHARS + 1)), where)).toThrow(
      ShipPromptError,
    );
    expect(() => shipPrompt(text("short", true), where)).toThrow("longer than 10,000 characters");
  });

  test("a file that is not text is refused, not sent", () => {
    expect(() => shipPrompt({ kind: "binary", size: 5 }, where)).toThrow(
      ".aven/ship.md is not a text file",
    );
  });
});
