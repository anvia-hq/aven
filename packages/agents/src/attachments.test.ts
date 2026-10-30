import { describe, expect, test } from "bun:test";

import { promptWithAttachments, type KeptAttachment } from "./attachments";
import { messagesToChat } from "./projection";

const chart: KeptAttachment = {
  name: "chart.png",
  mediaType: "image/png",
  size: 2048,
  image: "11111111-1111-4111-8111-111111111111.png",
  path: "/uploads/chart.png",
};
const deck: KeptAttachment = {
  name: "Q3 deck.pptx",
  mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  size: 3 * 1024 * 1024,
  path: "/uploads/Q3_deck.pptx",
};

describe("promptWithAttachments", () => {
  test("tells the agent where every file is and shows it the images", () => {
    const prompt = promptWithAttachments(
      "summarise these",
      [chart, deck],
      new Map([[chart.image!, "iVBO"]]),
    );
    const [said, note, image, ...rest] = Array.isArray(prompt.content) ? prompt.content : [];
    expect(said).toEqual({ type: "text", text: "summarise these" });
    expect(note?.type === "text" && note.text).toBe(
      [
        "The user attached 2 files. They are in the sandbox, read-only, in /uploads:",
        "- /uploads/chart.png (image/png, 2.0 KB, shown to you below)",
        `- /uploads/Q3_deck.pptx (${deck.mediaType}, 3.0 MB)`,
      ].join("\n"),
    );
    expect(image).toEqual({
      type: "image",
      image: { type: "data", data: "iVBO" },
      mediaType: "image/png",
    });
    expect(rest).toEqual([]);
  });

  test("a message of files alone still says where they are", () => {
    const prompt = promptWithAttachments("", [deck], new Map());
    const content = Array.isArray(prompt.content) ? prompt.content : [];
    expect(content).toHaveLength(1);
    expect(content[0]?.type === "text" && content[0].text).toContain("attached a file");
  });
});

describe("messagesToChat with attachments", () => {
  test("shows the message as it was sent: the user's text and files, not the note to the agent", () => {
    const sent = promptWithAttachments("look", [chart, deck], new Map([[chart.image!, "iVBO"]]));
    const [user] = messagesToChat([sent]);
    expect(user?.parts).toEqual([{ type: "text", text: "look" }]);
    expect(user?.attachments).toEqual([
      { name: "chart.png", mediaType: "image/png", size: 2048, image: chart.image },
      { name: "Q3 deck.pptx", mediaType: deck.mediaType, size: deck.size },
    ]);
  });

  test("a message without files, or with metadata it does not know, is its text alone", () => {
    const chat = messagesToChat([
      { role: "user", content: "plain" },
      { role: "user", content: [{ type: "text", text: "odd" }], metadata: { attachments: "no" } },
    ]);
    expect(chat.map((message) => message.parts)).toEqual([
      [{ type: "text", text: "plain" }],
      [{ type: "text", text: "odd" }],
    ]);
    expect(chat.some((message) => "attachments" in message)).toBe(false);
  });
});
