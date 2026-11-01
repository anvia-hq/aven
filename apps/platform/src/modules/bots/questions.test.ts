import { describe, expect, test } from "bun:test";

import { answerText, isOpen } from "./questions";
import type { BotChatMessage } from "./types";

const scope = { id: "scope", text: "Which scope?" };
const when = { id: "when", text: "By when?" };

describe("answerText", () => {
  test("is the answer alone for one question", () => {
    expect(answerText([scope], { scope: " Scout " })).toBe("Scout");
  });

  test("numbers the answers in the order asked, and leaves the bot's words about its questions out", () => {
    expect(answerText([scope, when], { scope: "Scout", when: "Friday" })).toBe(
      "1. Scout\n2. Friday",
    );
  });
});

describe("isOpen", () => {
  const asking: BotChatMessage = { id: "m-1", role: "bot", text: "Which?", questions: [scope] };
  const said = (
    id: string,
    role: "user" | "bot",
    peer?: BotChatMessage["peer"],
  ): BotChatMessage => ({
    id,
    role,
    text: "x",
    peer,
  });
  const peer = { name: "Scout", handle: "scout", direction: "from" as const };

  test("is open until the person says something after it", () => {
    expect(isOpen([said("m-0", "user"), asking], asking)).toBe(true);
    expect(isOpen([asking, said("m-2", "user")], asking)).toBe(false);
  });

  test("is still open when a bot writes to this one, or this one goes on", () => {
    expect(isOpen([asking, said("m-2", "user", peer), said("m-3", "bot")], asking)).toBe(true);
  });

  test("is not a question when the message has none", () => {
    expect(isOpen([said("m-0", "bot")], said("m-0", "bot"))).toBe(false);
  });
});
