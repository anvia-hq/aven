import { describe, expect, test } from "bun:test";

import { quoteAuthor, quoteOf } from "./quote";
import type { Bot, BotChatMessage } from "./types";

const aven: Bot = {
  id: "b1",
  name: "Aven",
  handle: "main",
  instruction: "",
  description: "",
  avatar: "",
  providerId: null,
  modelId: null,
  reasoningEffort: null,
  compactAfterTokens: null,
  runtimeId: null,
  isMain: true,
  createdAt: "",
  updatedAt: "",
};

const scout: Bot = {
  ...aven,
  id: "b2",
  name: "Scout",
  handle: "scout",
  isMain: false,
};

describe("who wrote a quoted message (decision 0258)", () => {
  test("is the person for their own, and the bot chatting when it is its message", () => {
    expect(quoteAuthor({ role: "user" }, aven, [])).toBe("You");
    expect(quoteAuthor({ role: "bot" }, aven, [])).toBe("Aven");
  });

  test("is the other bot, by the name it has now, when one bot wrote it", () => {
    expect(
      quoteAuthor({ role: "bot", peer: { name: "Old", handle: "scout" } }, aven, [scout]),
    ).toBe("Scout");
    expect(
      quoteAuthor({ role: "user", peer: { name: "Old", handle: "scout" } }, aven, [scout]),
    ).toBe("Scout");
  });

  test("is the name the message carries when that bot is gone", () => {
    expect(quoteAuthor({ role: "bot", peer: { name: "Old", handle: "gone" } }, aven, [])).toBe(
      "Old",
    );
  });
});

describe("the quote of a message (decision 0258)", () => {
  test("carries who wrote it and whose message it was between bots", () => {
    const message: BotChatMessage = {
      id: "m-3",
      role: "user",
      text: "hello",
      peer: { name: "Scout", handle: "scout", direction: "from" },
    };
    expect(quoteOf(message)).toEqual({
      id: "m-3",
      role: "user",
      text: "hello",
      peer: { name: "Scout", handle: "scout", direction: "from" },
    });
    expect(quoteOf({ id: "m-4", role: "bot", text: "hi" })).toEqual({
      id: "m-4",
      role: "bot",
      text: "hi",
    });
  });
});
