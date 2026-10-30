import { describe, expect, test } from "bun:test";

import { sendMessageBody } from "./schema";

const prompt = "fix @src/app.ts with /writing-skills";
const file = { type: "file", name: "src/app.ts", from: 4, to: 15 };
const skill = { type: "skill", name: "writing-skills", from: 21, to: 36 };
const parses = (body: object) => sendMessageBody.safeParse({ prompt, ...body }).success;

describe("a message's mentions", () => {
  test("are taken when each token is where it says", () => {
    expect(parses({ mentions: [file, skill] })).toBe(true);
    // The prompt is trimmed before the tokens are looked for.
    const padded = sendMessageBody.safeParse({ prompt: `${prompt}\n`, mentions: [file] });
    expect(padded.success).toBe(true);
  });

  test("are refused when a token is elsewhere or names something else", () => {
    expect(parses({ mentions: [{ ...file, from: 5, to: 16 }] })).toBe(false);
    expect(parses({ mentions: [{ ...file, name: "src/other.ts" }] })).toBe(false);
    expect(parses({ mentions: [{ ...skill, type: "file" }] })).toBe(false);
  });

  test("are refused when a file is outside the workspace or a skill is no skill's name", () => {
    const at = (name: string) => ({
      prompt: `@${name}`,
      mentions: [{ type: "file", name, from: 0, to: name.length + 1 }],
    });
    expect(sendMessageBody.safeParse(at("src/a.ts")).success).toBe(true);
    for (const name of ["../etc/passwd", "/etc/passwd", "src//a.ts", "src/../a.ts"]) {
      expect(sendMessageBody.safeParse(at(name)).success).toBe(false);
    }
    const slash = {
      prompt: "/Bad_Name",
      mentions: [{ type: "skill", name: "Bad_Name", from: 0, to: 9 }],
    };
    expect(sendMessageBody.safeParse(slash).success).toBe(false);
  });
});
