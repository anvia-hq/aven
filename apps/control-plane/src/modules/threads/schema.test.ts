import { describe, expect, test } from "bun:test";

import { answerQuestionBody, exportQuery, sendMessageBody, updateThreadBody } from "./schema";

const prompt = "fix @src/app.ts with /writing-skills";
const file = { type: "file", name: "src/app.ts", from: 4, to: 15 };
const skill = { type: "skill", name: "writing-skills", from: 21, to: 36 };
const parses = (body: object) => sendMessageBody.safeParse({ prompt, ...body }).success;

describe("a message's mentions", () => {
  test("are taken when each token is where it says", () => {
    expect(parses({ mentions: [file, skill] })).toBe(true);
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

describe("answerQuestionBody (decision 0047)", () => {
  const answers = [{ questionId: "STRIPE_API_KEY", value: "sk_test_1234" }];

  test("a secret becomes the project's unless the person says otherwise", () => {
    expect(answerQuestionBody.parse({ answers }).secretScope).toBe("project");
    expect(answerQuestionBody.parse({ answers, secretScope: "personal" }).secretScope).toBe(
      "personal",
    );
  });

  test("the workspace is not a choice, and neither is anything else", () => {
    for (const secretScope of ["workspace", "everyone", ""]) {
      expect(answerQuestionBody.safeParse({ answers, secretScope }).success).toBe(false);
    }
  });

  test("a person can decline", () => {
    expect(answerQuestionBody.parse({ answers, skipSecrets: true }).skipSecrets).toBe(true);
  });
});

describe("updateThreadBody's mark color", () => {
  const mark = (markColor: unknown) => updateThreadBody.safeParse({ markColor }).success;

  test("takes a six-digit hex color, or a null that puts the default back", () => {
    expect(mark("#3b82f6")).toBe(true);
    expect(mark(null)).toBe(true);
  });

  test("refuses a name, a short hex, eight digits or nothing at all", () => {
    for (const color of ["blue", "#3b82f", "#3b82f6ff", "3b82f6", "", 42]) {
      expect(mark(color)).toBe(false);
    }
  });

  test("a body that names no field updates nothing", () => {
    expect(updateThreadBody.safeParse({}).success).toBe(false);
  });
});

describe("exportQuery", () => {
  test("takes a format name of any length, so unknown ones fall back to markdown", () => {
    expect(exportQuery.parse({ format: "application/pdf" })).toEqual({ format: "application/pdf" });
    expect(exportQuery.parse({})).toEqual({});
  });
});
