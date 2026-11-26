import { describe, expect, test } from "bun:test";

import type { ChatMessage } from "@aven/protocol/types";
import { UnprocessableError } from "@aven/server-kit/errors";

import type { ModelConfig } from "@aven/agents/types";

import { cleanTitle, createThreadTitler, exchangeOf, titleModel } from "./title";

const user = (text: string): ChatMessage => ({
  id: `u-${text}`,
  role: "user",
  parts: [{ type: "text", text }],
});

const assistant = (...parts: ChatMessage["parts"]): ChatMessage => ({
  id: `a-${parts.length}`,
  role: "assistant",
  parts,
});

describe("exchangeOf", () => {
  test("is the latest user message and the reply that follows it", () => {
    const messages = [
      user("first question"),
      assistant({ type: "text", text: "first answer" }),
      user("rebase on main"),
      assistant({ type: "reasoning", text: "thinking" }, { type: "text", text: "Done, rebased." }),
    ];
    expect(exchangeOf(messages)).toEqual({ user: "rebase on main", assistant: "Done, rebased." });
  });

  test("keeps the question when the agent has not answered yet", () => {
    expect(exchangeOf([user("one"), assistant({ type: "text", text: "a" }), user("two")])).toEqual({
      user: "two",
      assistant: "",
    });
  });

  test("ignores tool and reasoning parts, and gives nothing for a thread with no message", () => {
    expect(exchangeOf([])).toBeNull();
    expect(exchangeOf([assistant({ type: "text", text: "hello" })])).toBeNull();
  });

  test("cuts very long messages", () => {
    const found = exchangeOf([
      user("x".repeat(5000)),
      assistant({ type: "text", text: "y".repeat(9000) }),
    ]);
    expect(found!.user.length).toBeLessThan(2000);
    expect(found!.assistant.length).toBeLessThan(3000);
  });
});

describe("cleanTitle", () => {
  test("drops quotes, a Title: prefix, trailing dots and extra space", () => {
    expect(cleanTitle('  "Title: Fix  the flaky test."  ')).toBe("Fix the flaky test");
    expect(cleanTitle("“Rebase onto main”")).toBe("Rebase onto main");
  });
});

describe("createThreadTitler", () => {
  test("says so when there is neither a small model nor a provider of the person's own", async () => {
    const titler = createThreadTitler(async () => null);
    await expect(titler.suggest({ user: "hi", assistant: "" }, "u1")).rejects.toBeInstanceOf(
      UnprocessableError,
    );
  });
});

describe("titleModel", () => {
  const small: ModelConfig = { provider: "openai", modelId: "small" };
  const own: ModelConfig = { provider: "anthropic", modelId: "big" };

  test("prefers the server's small model", async () => {
    const asked: string[] = [];
    const found = await titleModel("u1", {
      small: async () => small,
      own: async (id) => {
        asked.push(id);
        return own;
      },
    });
    expect(found).toBe(small);
    expect(asked).toEqual([]);
  });

  test("falls back to the person's own model when no small model is set", async () => {
    const found = await titleModel("u1", { small: async () => null, own: async () => own });
    expect(found).toBe(own);
  });

  test("is nothing when neither exists", async () => {
    expect(await titleModel("u1", { small: async () => null, own: async () => null })).toBeNull();
  });
});
