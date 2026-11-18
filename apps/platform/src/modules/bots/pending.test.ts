import { describe, expect, test } from "bun:test";

import { pendingMessage, settlePending } from "./pending";
import type { BotChatMessage } from "./types";

const said = (id: string, text: string, names: string[] = []): BotChatMessage => {
  const message: BotChatMessage = { id, role: "user", text };

  if (names.length > 0) {
    message.attachments = names.map((name) => ({ name, mediaType: "image/png", size: 2 }));
  }

  return message;
};

describe("pendingMessage", () => {
  test("keeps the words, the quote and a local preview of each file", () => {
    const { id, message } = pendingMessage(
      "1",
      "hello",
      [{ name: "chart.png", mediaType: "image/png", data: "aGk=" }],
      { id: "b-1", role: "bot", text: "earlier" },
    );

    expect(id).toBe("1");
    expect(message).toEqual({
      id: "pending-1",
      role: "user",
      text: "hello",
      quote: { id: "b-1", role: "bot", text: "earlier" },
      attachments: [
        {
          name: "chart.png",
          mediaType: "image/png",
          size: 2,
          image: "data:image/png;base64,aGk=",
        },
      ],
    });
  });

  test("keeps no preview for a file the browser cannot draw", () => {
    const { message } = pendingMessage("1", "", [
      { name: "notes.txt", mediaType: "text/plain", data: "aGk=" },
    ]);

    expect(message.attachments).toEqual([{ name: "notes.txt", mediaType: "text/plain", size: 2 }]);
  });
});

describe("settlePending", () => {
  test("the server's own copy of the message drops the pending one", () => {
    const pending = [pendingMessage("1", "hello")];

    expect(settlePending(pending, { type: "message", message: said("m-0", "hello") })).toEqual([]);
  });

  test("words and files decide it: the same words with another file are another message", () => {
    const pending = [
      pendingMessage("1", "here", [{ name: "chart.png", mediaType: "image/png", data: "aGk=" }]),
    ];

    const other = settlePending(pending, {
      type: "message",
      message: said("m-0", "here", ["a.png"]),
    });

    expect(other).toHaveLength(1);
  });

  test("a message of files alone settles by its files", () => {
    const pending = [
      pendingMessage("1", "", [{ name: "chart.png", mediaType: "image/png", data: "aGk=" }]),
    ];

    expect(
      settlePending(pending, { type: "message", message: said("m-0", "", ["chart.png"]) }),
    ).toEqual([]);
  });

  test("the bot's reply settles nothing", () => {
    const pending = [pendingMessage("1", "hello")];

    expect(
      settlePending(pending, {
        type: "message",
        message: { id: "b-0", role: "bot", text: "hello" },
      }),
    ).toHaveLength(1);
  });

  test("two identical sends settle one at a time", () => {
    const pending = [pendingMessage("1", "hello"), pendingMessage("2", "hello")];
    const once = settlePending(pending, { type: "message", message: said("m-0", "hello") });

    expect(once.map(({ id }) => id)).toEqual(["2"]);
    expect(settlePending(once, { type: "message", message: said("m-1", "hello") })).toEqual([]);
  });

  test("a snapshot settles what it lists and keeps what it does not", () => {
    const pending = [pendingMessage("1", "hello"), pendingMessage("2", "later")];
    const settled = settlePending(pending, {
      type: "snapshot",
      typing: false,
      messages: [said("m-0", "hello")],
    });

    expect(settled.map(({ id }) => id)).toEqual(["2"]);
  });

  test("an activity or typing event leaves the pending message alone", () => {
    const pending = [pendingMessage("1", "hello")];

    expect(settlePending(pending, { type: "typing", typing: true })).toBe(pending);
    expect(settlePending(pending, { type: "activity", label: "Reading" })).toBe(pending);
  });
});
