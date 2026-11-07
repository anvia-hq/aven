import { describe, expect, test } from "bun:test";

import { pendingMessage, settlePending, withoutPending } from "./pending-messages";
import type { OutgoingMessage, PendingMessage } from "./types";
import type { ChatMessage, RunEvent } from "@aven/protocol/types";

const message = (prompt: string, extra: Partial<OutgoingMessage> = {}): OutgoingMessage => ({
  prompt,
  attachments: [],
  mentions: [],
  ...extra,
});

const sent = (id: string, prompt: string, extra: Partial<OutgoingMessage> = {}) =>
  pendingMessage(id, message(prompt, extra));

const user = (text: string): ChatMessage => ({
  id: `m-${text}`,
  role: "user",
  parts: [{ type: "text", text }],
});

describe("pendingMessage", () => {
  test("shows the prompt with an id of its own on this browser", () => {
    const { message: shown } = sent("a", "Fix the tests");
    expect(shown.role).toBe("user");
    expect(shown.parts).toEqual([{ type: "text", text: "Fix the tests" }]);
    expect(shown.id).toBe("pending-a");
  });

  test("keeps the files with their size, in bytes, from their base64", () => {
    const { message: shown } = sent("a", "Here", {
      attachments: [
        { name: "notes.txt", mediaType: "text/plain", data: "aGVsbG8=" },
        { name: "blob", data: "aGVsbG8h" },
      ],
    });
    expect(shown.attachments).toEqual([
      { name: "notes.txt", mediaType: "text/plain", size: 5 },
      { name: "blob", mediaType: "application/octet-stream", size: 6 },
    ]);
  });

  test("keeps the mentions", () => {
    const mention = { type: "file" as const, name: "src/index.ts", from: 0, to: 13 };
    expect(sent("a", "@src/index.ts", { mentions: [mention] }).message.mentions).toEqual([mention]);
  });
});

describe("settlePending", () => {
  const one = [sent("a", "Fix the tests")];

  test("drops the one a run's start brings", () => {
    const event: RunEvent = { type: "run_start", prompt: "Fix the tests" };
    expect(settlePending(one, event)).toEqual([]);
  });

  test("drops the first of the same words, leaving the rest", () => {
    const two = [sent("a", "Again"), sent("b", "Again")];
    const event: RunEvent = { type: "run_start", prompt: "Again" };
    expect(settlePending(two, event).map(({ id }) => id)).toEqual(["b"]);
  });

  test("leaves one another run's start does not bring", () => {
    const event: RunEvent = { type: "run_start", prompt: "Something else" };
    expect(settlePending(one, event)).toEqual(one);
  });

  test("drops the one a steer takes, and the one said to be queued or refused", () => {
    for (const type of ["steer", "steer_queued", "steer_rejected"] as const) {
      const event = { type, id: "a", prompt: "Fix the tests" } as RunEvent;
      expect(settlePending(one, event)).toEqual([]);
    }
  });

  test("drops what a stream that attached again already lists", () => {
    const event: RunEvent = {
      type: "snapshot",
      messages: [user("Hello"), { id: "m-2", role: "assistant", parts: [] }, user("Fix the tests")],
      running: true,
    };
    expect(settlePending(one, event)).toEqual([]);
  });

  test("keeps one the snapshot's tail does not list", () => {
    const event: RunEvent = {
      type: "snapshot",
      messages: [user("Fix the tests"), user("Something else")],
      running: true,
    };
    expect(settlePending(one, event)).toEqual(one);
  });

  test("leaves the list alone for an event that says nothing of it", () => {
    const event: RunEvent = { type: "text", delta: "Working" };
    expect(settlePending(one, event)).toBe(one);
  });

  test("keeps none shorter than an empty list", () => {
    const event: RunEvent = {
      type: "snapshot",
      messages: [],
      running: false,
    };
    expect(settlePending([], event)).toEqual([]);
  });
});

describe("withoutPending", () => {
  test("drops the message it names only", () => {
    const list: PendingMessage[] = [sent("a", "One"), sent("b", "Two")];
    expect(withoutPending(list, "a").map(({ id }) => id)).toEqual(["b"]);
  });
});
