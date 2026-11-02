import { describe, expect, test } from "bun:test";

import { ATTACHMENT_LIMITS } from "@aven/protocol/events";

import { sendBotMessageBody, updateBotBody } from "./schema";

describe("updateBotBody", () => {
  test("takes a compaction size within bounds, or none to leave it to the model", () => {
    expect(updateBotBody.safeParse({ compactAfterTokens: 50_000 }).success).toBe(true);
    expect(updateBotBody.safeParse({ compactAfterTokens: null }).success).toBe(true);
    expect(updateBotBody.safeParse({ compactAfterTokens: 10 }).success).toBe(false);
    expect(updateBotBody.safeParse({ compactAfterTokens: 3_000_000 }).success).toBe(false);
    expect(updateBotBody.safeParse({ compactAfterTokens: 1500.5 }).success).toBe(false);
  });

  test("takes an effort or none", () => {
    expect(updateBotBody.safeParse({ reasoningEffort: "high" }).success).toBe(true);
    expect(updateBotBody.safeParse({ reasoningEffort: null }).success).toBe(true);
    expect(updateBotBody.safeParse({ reasoningEffort: "" }).success).toBe(false);
  });
});

describe("sendBotMessageBody", () => {
  const file = { name: "notes.txt", data: "aGVsbG8=" };

  test("takes text, files, or both, and not neither", () => {
    expect(sendBotMessageBody.safeParse({ text: "hello" }).success).toBe(true);
    expect(sendBotMessageBody.safeParse({ text: "", attachments: [file] }).success).toBe(true);
    expect(sendBotMessageBody.safeParse({ text: "look", attachments: [file] }).success).toBe(true);
    expect(sendBotMessageBody.safeParse({ text: "  " }).success).toBe(false);
    expect(sendBotMessageBody.safeParse({ text: "", attachments: [] }).success).toBe(false);
  });

  test("takes only so many files, whose bytes are base64", () => {
    const many = Array.from({ length: ATTACHMENT_LIMITS.count + 1 }, () => file);
    expect(sendBotMessageBody.safeParse({ text: "x", attachments: many }).success).toBe(false);
    expect(
      sendBotMessageBody.safeParse({ text: "x", attachments: [{ ...file, data: "not base64!" }] })
        .success,
    ).toBe(false);
  });
});
