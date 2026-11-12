import { describe, expect, test } from "bun:test";

import {
  botIdOfHref,
  linkBotMentions,
  splitBotMentions,
  splitMentions,
  threadMentionText,
} from "./mentions";
import type { Bot } from "./types";

const bot = (id: string, name: string): Bot => ({
  id,
  name,
  instruction: "",
  description: "",
  avatar: "",
  providerId: null,
  modelId: null,
  reasoningEffort: null,
  compactAfterTokens: null,
  runtimeId: null,
  isMain: false,
  createdAt: "",
  updatedAt: "",
});

const scout = bot("b1", "Scout");
const analyst = bot("b2", "Data Analyst");
const data = bot("b3", "Data");

const shape = (parts: ReturnType<typeof splitBotMentions>) =>
  parts.map((part) => (part.type === "text" ? part.text : `@${part.bot.id}`));

describe("splitBotMentions", () => {
  test("cuts the text at a bot's name and keeps what is around it", () => {
    expect(shape(splitBotMentions("Ask @Scout to do A, B and C", [scout]))).toEqual([
      "Ask ",
      "@b1",
      " to do A, B and C",
    ]);
    expect(shape(splitBotMentions("@Scout first, then @Scout again", [scout]))).toEqual([
      "@b1",
      " first, then ",
      "@b1",
      " again",
    ]);
  });

  test("a name with spaces is one mention, and the longer name wins over a shorter one it starts with", () => {
    expect(shape(splitBotMentions("ask @Data Analyst now", [data, analyst]))).toEqual([
      "ask ",
      "@b2",
      " now",
    ]);
    expect(shape(splitBotMentions("ask @Data now", [data, analyst]))).toEqual([
      "ask ",
      "@b3",
      " now",
    ]);
  });

  test("is the case the person typed, but finds the bot whatever the case", () => {
    expect(shape(splitBotMentions("ask @scout", [scout]))).toEqual(["ask ", "@b1"]);
  });

  test("is not a mention inside a word or an address, or of a name that is only the start of a longer one", () => {
    for (const text of ["mail me at x@Scout.io", "ask @Scouting", "@Scouts here", "a@Scout"]) {
      expect(splitBotMentions(text, [scout])).toEqual([{ type: "text", text }]);
    }
  });

  test("a name with characters that mean something in a pattern is taken as it is", () => {
    const odd = bot("b4", "C++ (beta)");
    expect(shape(splitBotMentions("ask @C++ (beta) please", [odd]))).toEqual([
      "ask ",
      "@b4",
      " please",
    ]);
  });

  test("with no bots, or no mention, the text is left whole", () => {
    expect(splitBotMentions("hello @Scout", [])).toEqual([{ type: "text", text: "hello @Scout" }]);
    expect(splitBotMentions("hello", [scout])).toEqual([{ type: "text", text: "hello" }]);
    expect(splitBotMentions("", [scout])).toEqual([{ type: "text", text: "" }]);
  });
});

const THREAD = "0b3e6a1e-52c4-4f5b-9a0d-3a5f6f0c9d11";

describe("a thread mention", () => {
  test("is written with the thread's id and a title with no brackets or line breaks", () => {
    expect(threadMentionText(THREAD, "Fix the export button")).toBe(
      `@[Fix the export button](thread:${THREAD})`,
    );
    expect(threadMentionText(THREAD, "Fix [the] (export)\nbutton")).toBe(
      `@[Fix the export button](thread:${THREAD})`,
    );
    expect(threadMentionText(THREAD, "  ")).toBe(`@[Untitled thread](thread:${THREAD})`);
    expect(threadMentionText(THREAD, "x".repeat(200))).toBe(
      `@[${"x".repeat(60)}](thread:${THREAD})`,
    );
  });

  test("is found in a message next to a bot's name, and the rest is kept", () => {
    const text = `Ask @Scout about ${threadMentionText(THREAD, "Fix the export button")} please`;
    expect(splitMentions(text, [scout])).toEqual([
      { type: "text", text: "Ask " },
      { type: "mention", bot: scout },
      { type: "text", text: " about " },
      { type: "thread", id: THREAD, title: "Fix the export button" },
      { type: "text", text: " please" },
    ]);
  });

  test("is not one when the id is not a thread's or the link is broken", () => {
    for (const text of [
      "@[Title](thread:not-an-id)",
      `@[Title](thread:${THREAD.toUpperCase()}`,
      `[Title](thread:${THREAD})`,
      `@[](thread:${THREAD})`,
    ]) {
      expect(splitMentions(text, [])).toEqual([{ type: "text", text }]);
    }
  });
});

describe("linkBotMentions", () => {
  const remy = bot("b9", "Remy");

  test("links a bot named in a reply, in any case and after punctuation", () => {
    expect(linkBotMentions("**Remy** (@remy): research, then @Remy.", [remy])).toBe(
      "**Remy** ([@Remy](#bot-b9)): research, then [@Remy](#bot-b9).",
    );
  });

  test("leaves code, emails and other words alone", () => {
    expect(linkBotMentions("`@remy` and a@remy.dev and @remington", [remy])).toBe(
      "`@remy` and a@remy.dev and @remington",
    );
  });

  test("names the bot back from a link and ignores other links", () => {
    expect(botIdOfHref("#bot-b9")).toBe("b9");
    expect(botIdOfHref("https://example.com")).toBeUndefined();
  });
});
