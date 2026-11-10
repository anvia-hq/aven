import { describe, expect, test } from "bun:test";

import {
  isLocalPreview,
  pendingMessage,
  pendingShip,
  settlePending,
  withoutPending,
} from "./pending-messages";
import { wrapShipRequest } from "@aven/protocol/ship-request";

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
  test("gives an image a preview made from its own bytes, and no other file", () => {
    const { message: shown } = sent("a", "Look", {
      attachments: [
        { name: "shot.png", mediaType: "image/png", data: "aGVsbG8=" },
        { name: "logo.svg", mediaType: "image/svg+xml", data: "aGVsbG8=" },
        { name: "notes.txt", mediaType: "text/plain", data: "aGVsbG8=" },
        { name: "blob", data: "aGVsbG8=" },
      ],
    });
    const [png, svg, text, blob] = shown.attachments!;
    expect(png!.image).toBe("data:image/png;base64,aGVsbG8=");
    expect(isLocalPreview(png!.image!)).toBe(true);
    expect(svg!.image).toBeUndefined();
    expect(text!.image).toBeUndefined();
    expect(blob!.image).toBeUndefined();
    expect(isLocalPreview("0b3e6a1e.png")).toBe(false);
  });

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

  test("drops the one a teammate sent, whose prompt the server marks with their name", () => {
    const text = "@Indra is this project ready ?";
    const marked = `[driver: Zed] ${text}`;
    const mine = [sent("a", text)];
    expect(settlePending(mine, { type: "run_start", prompt: marked })).toEqual([]);
    const snapshot: RunEvent = {
      type: "snapshot",
      messages: [user(marked)],
      running: true,
    };
    expect(settlePending(mine, snapshot)).toEqual([]);
  });

  test("drops the one whose text looks like a mark, which the server shields with a hidden character", () => {
    const text = "[driver: Zed] was this you?";
    const event: RunEvent = { type: "run_start", prompt: `\u200b${text}` };
    expect(settlePending([sent("a", text)], event)).toEqual([]);
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

describe("a ship card shown before the server has the request", () => {
  const request = wrapShipRequest("Commit, push, then open it with gh pr create --draft.");
  const started = (prompt: string): RunEvent => ({ type: "run_start", prompt }) as RunEvent;

  test("is settled by the run that starts with the real ship prompt, whatever its text", () => {
    const pending = [pendingShip("s1")];
    expect(settlePending(pending, started(request))).toEqual([]);
    expect(settlePending(pending, started("an ordinary message"))).toEqual(pending);
  });

  test("is settled by a snapshot that has the ship request, and by no other message", () => {
    const pending = [pendingShip("s1")];
    const snapshot = (...texts: string[]) =>
      ({ type: "snapshot", messages: texts.map(user) }) as unknown as RunEvent;
    expect(settlePending(pending, snapshot("hello", request))).toEqual([]);
    expect(settlePending(pending, snapshot(request, "hello"))).toEqual(pending);
  });

  test("leaves a message typed meanwhile in place", () => {
    const pending = [pendingShip("s1"), sent("a", "and also this")];
    expect(settlePending(pending, started(request)).map(({ id }) => id)).toEqual(["a"]);
  });
});
