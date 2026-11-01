import { describe, expect, test } from "bun:test";

import { answerText } from "./questions";

const scope = { id: "scope", text: "Which scope?" };
const when = { id: "when", text: "By when?" };

describe("answerText", () => {
  test("is the answer alone for one question", () => {
    expect(answerText([scope], { scope: " Scout " })).toBe("Scout");
  });

  test("puts each question before its answer when there are several", () => {
    expect(answerText([scope, when], { scope: "Scout", when: "Friday" })).toBe(
      "Which scope? Scout\nBy when? Friday",
    );
  });
});
