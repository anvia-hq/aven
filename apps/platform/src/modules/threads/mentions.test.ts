import { describe, expect, test } from "bun:test";

import {
  AGENT_ENTITY,
  MENTION_MARK,
  markMentions,
  mentionOf,
  personIdOf,
  personToken,
} from "./mentions";

describe("mentioning a teammate in a multiplayer thread (decision 0191)", () => {
  test("a teammate is written with their id, and a name that would break the token is cleaned", () => {
    expect(personToken({ id: "u-2", name: "Randy Pratama" })).toBe("@[Randy Pratama](user:u-2)");
    expect(personToken({ id: "u-3", name: "A]B`C\nD" })).toBe("@[A B C D](user:u-3)");
    expect(personToken({ id: "u-4", name: "   " })).toBe("@[Teammate](user:u-4)");
    expect(personToken({ id: "u-5", name: "x".repeat(200) })).toHaveLength(
      "@[](user:u-5)".length + 80,
    );
  });

  test("a person is told from a file or a skill by the id, and is never sent as a file mention", () => {
    expect(personIdOf("user:u-2")).toBe("u-2");
    expect(personIdOf("src/app.ts")).toBeUndefined();
    expect(mentionOf("file", "user:u-2")).toBeUndefined();
    expect(mentionOf("file", "src/app.ts")).toEqual({ type: "file", name: "src/app.ts" });
  });

  test("a sent message shows the teammate's name where the token was, beside file mentions", () => {
    const text = "@[Randy](user:u-2) look at @src/app.ts";
    const marked = markMentions(text, [{ type: "file", name: "src/app.ts", from: 27, to: 39 }]);
    expect(marked).toBe(
      `\`${MENTION_MARK}person:Randy\` look at \`${MENTION_MARK}file:src/app.ts\``,
    );
    expect(markMentions("no tokens here")).toBe("no tokens here");
  });
});

describe("mentioning the agent", () => {
  test("is a handle in the text and not a file or skill mention sent with the message", () => {
    expect(mentionOf("file", AGENT_ENTITY)).toBeUndefined();
  });
});
