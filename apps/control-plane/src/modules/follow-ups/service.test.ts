import { describe, expect, test } from "bun:test";

import type { ChatMessage } from "@aven/protocol/types";

import { createFollowUps } from "./service";
import { clean } from "./suggest";
import { followUpTranscript } from "./transcript";

const message = (role: ChatMessage["role"], text: string): ChatMessage =>
  ({ id: text, role, parts: [{ type: "text", text }] }) as ChatMessage;

const viewer = { organizationId: "org", userId: "user" };

describe("followUpTranscript", () => {
  test("is the end of the conversation when the agent spoke last", () => {
    const text = followUpTranscript([
      message("user", "Add Box cards"),
      message("assistant", "I can do it two ways."),
    ]);
    expect(text).toBe("User: Add Box cards\n\nAgent: I can do it two ways.");
  });

  test("is undefined while the user spoke last or the agent said nothing", () => {
    expect(followUpTranscript([message("user", "Hi")])).toBeUndefined();
    expect(followUpTranscript([message("user", "Hi"), message("assistant", " ")])).toBeUndefined();
    expect(followUpTranscript([])).toBeUndefined();
  });

  test("keeps the end of a long reply, where its question or proposal is", () => {
    const long = `${"x".repeat(3000)} Shall I go with Box cards?`;
    const text = followUpTranscript([message("user", "Go"), message("assistant", long)]);
    expect(text?.endsWith("Shall I go with Box cards?")).toBe(true);
    expect(text?.includes("x".repeat(3000))).toBe(false);
  });

  test("keeps only the last few messages", () => {
    const many = Array.from({ length: 8 }, (_, index) =>
      message(index % 2 === 0 ? "user" : "assistant", `m${index}`),
    );
    expect(followUpTranscript(many)?.includes("m3")).toBe(false);
    expect(followUpTranscript(many)?.includes("m4")).toBe(true);
  });
});

describe("clean", () => {
  test("trims and drops blanks and repeats", () => {
    expect(clean([" Go ", "Go", "", "Ship it"])).toEqual(["Go", "Ship it"]);
  });
});

describe("createFollowUps", () => {
  test("asks the small model only when the agent spoke last", async () => {
    const asked: string[] = [];
    const followUps = createFollowUps({
      messagesOf: async () => [message("user", "Go"), message("assistant", "Done.")],
      suggest: async (_user, transcript) => {
        asked.push(transcript);
        return ["Run the tests"];
      },
    });
    expect(await followUps.forThread(viewer, "t")).toEqual({ suggestions: ["Run the tests"] });
    expect(asked).toHaveLength(1);

    const quiet = createFollowUps({
      messagesOf: async () => [message("user", "Go")],
      suggest: async () => {
        throw new Error("must not be asked");
      },
    });
    expect(await quiet.forThread(viewer, "t")).toEqual({ suggestions: [] });
  });
});
