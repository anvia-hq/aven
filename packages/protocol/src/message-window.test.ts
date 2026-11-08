import { describe, expect, test } from "bun:test";

import { applyEvent } from "./events";
import { latestMessages, messagesBefore } from "./message-window";
import type { ChatMessage } from "./types";

const conversation = (turns: number): ChatMessage[] =>
  Array.from({ length: turns }, (_, turn) => [
    {
      id: `x${turn * 2}`,
      role: "user" as const,
      parts: [{ type: "text" as const, text: `q${turn}` }],
    },
    {
      id: `x${turn * 2 + 1}`,
      role: "assistant" as const,
      parts: [{ type: "text" as const, text: `a${turn}` }],
    },
  ]).flat();

const text = (message: ChatMessage | undefined) =>
  message?.parts[0]?.type === "text" ? message.parts[0].text : undefined;

describe("the latest messages of a thread", () => {
  test("a short thread is shown whole, with nothing hidden", () => {
    const page = latestMessages(conversation(3), 10);
    expect(page.hidden).toBe(0);
    expect(page.messages).toHaveLength(6);
  });

  test("a long one is cut to the latest, starting at a person's message, and says how many it hid", () => {
    const messages = conversation(10);
    const page = latestMessages(messages, 5);
    expect(page.hidden).toBe(16);
    expect(page.messages).toHaveLength(4);
    expect(page.messages[0]?.role).toBe("user");
    expect(text(page.messages[0])).toBe("q8");
  });

  test("the ids start again at zero, so the reducer's ids for new messages follow on", () => {
    const page = latestMessages(conversation(10), 5);
    expect(page.messages.map((message) => message.id)).toEqual(["m-0", "m-1", "m-2", "m-3"]);
    const next = applyEvent(page.messages, { type: "run_start", prompt: "again" });
    expect(next.map((message) => message.id)).toEqual(["m-0", "m-1", "m-2", "m-3", "m-4", "m-5"]);
  });
});

describe("the messages before the ones shown", () => {
  test("pages back from where the last one began until nothing is hidden", () => {
    const messages = conversation(10);
    const first = latestMessages(messages, 6);
    const second = messagesBefore(messages, first.hidden, 6);
    expect(second.messages.at(-1)?.id).toBe(`e-${first.hidden - 1}`);
    expect(text(second.messages.at(-1))).toBe("a6");
    expect(second.hidden).toBe(8);
    const third = messagesBefore(messages, second.hidden, 6);
    const last = messagesBefore(messages, third.hidden, 6);
    expect(last.hidden).toBe(0);
    expect(text(last.messages[0])).toBe("q0");
    const ids = [second, third, last].flatMap((page) => page.messages.map((message) => message.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("a position past the end or before the start is clamped", () => {
    const messages = conversation(2);
    expect(messagesBefore(messages, 99, 10).messages).toHaveLength(4);
    expect(messagesBefore(messages, -3, 10)).toEqual({ messages: [], hidden: 0 });
  });
});
