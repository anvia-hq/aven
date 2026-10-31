import { describe, expect, test } from "bun:test";

import { splitBotMentions } from "./mentions";
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
