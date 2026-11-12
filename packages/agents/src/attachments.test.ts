import { describe, expect, test } from "bun:test";

import type { UserMessage } from "@anvia/core";

import { sentPrompt } from "./attachments";
import { messagesToChat } from "./projection";
import type { KeptAttachment, SentExtras } from "./types";
import type { MessageMention } from "@aven/protocol/types";

function sent(prompt: string, extras: SentExtras): UserMessage {
  const message = sentPrompt(prompt, extras);

  if (typeof message === "string") throw new Error("Expected a message");

  return message;
}

const texts = (message: UserMessage) =>
  Array.isArray(message.content)
    ? message.content.flatMap((part) => (part.type === "text" ? [part.text] : []))
    : [message.content];

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

describe("sentPrompt with attachments", () => {
  test("tells the agent where every file is and shows it the images", () => {
    const prompt = sent("summarise these", {
      attachments: [chart, deck],
      images: new Map([[chart.image!, "iVBO"]]),
    });
    const [said, note, image, ...rest] = Array.isArray(prompt.content) ? prompt.content : [];
    expect(said).toEqual({ type: "text", text: "summarise these" });
    expect(note?.type === "text" && note.text).toBe(
      [
        "The user attached 2 files. They are on this machine, read-only, in /uploads:",
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

  test("names a file by the folder it was written to", () => {
    const prompt = sent("look", {
      attachments: [{ ...chart, path: "/home/me/.aven/uploads/t1/chart.png" }],
    });
    const note = texts(prompt)[1];
    expect(note).toContain("in /home/me/.aven/uploads/t1:");
    expect(note).toContain("/home/me/.aven/uploads/t1/chart.png");
    expect(note).not.toContain("in /uploads");
  });

  test("a file that is not on the computer yet is named without a folder", () => {
    const prompt = sent("look", {
      attachments: [{ ...chart, path: "chart-ab12.png" }, deck],
    });
    const note = texts(prompt)[1];
    expect(note).toContain("in /uploads:");
    expect(note).toContain("/uploads/Q3_deck.pptx");
    expect(note).toContain("waiting to be written to the computer");
    expect(note).toContain("chart-ab12.png");
    expect(note).not.toContain("/uploads/chart-ab12.png");
  });

  test("a message of files alone still says where they are", () => {
    const prompt = sent("", { attachments: [deck] });
    const content = Array.isArray(prompt.content) ? prompt.content : [];
    expect(content).toHaveLength(1);
    expect(content[0]?.type === "text" && content[0].text).toContain("attached a file");
  });
});

describe("messagesToChat with attachments", () => {
  test("shows the message as it was sent: the user's text and files, not the note to the agent", () => {
    const message = sent("look", {
      attachments: [chart, deck],
      images: new Map([[chart.image!, "iVBO"]]),
    });
    const [user] = messagesToChat([message]);
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

const file: MessageMention = { type: "file", name: "src/app.ts", from: 4, to: 15 };
const skill: MessageMention = { type: "skill", name: "writing-skills", from: 21, to: 36 };
const listing = [
  { name: "writing-skills", description: "Write skills.", path: "/skills/writing-skills/SKILL.md" },
];

describe("sentPrompt with mentions", () => {
  test("text alone stays text", () => {
    expect(sentPrompt("hi")).toBe("hi");
    expect(sentPrompt("hi", { mentions: [] })).toBe("hi");
  });

  test("tells the agent where a mentioned file is and which skill to read", () => {
    const prompt = sent("fix @src/app.ts with /writing-skills", {
      mentions: [file, skill, file],
      skills: listing,
    });
    expect(texts(prompt)).toEqual([
      "fix @src/app.ts with /writing-skills",
      [
        "The user pointed at this file of the workspace with @:",
        "- /workspace/src/app.ts",
        "",
        "The user asked for this skill with /. Read each SKILL.md with read_file before you start, and follow it:",
        "- writing-skills: /skills/writing-skills/SKILL.md",
      ].join("\n"),
    ]);
  });

  test("a skill the run does not have is said to be missing", () => {
    const prompt = sent("/gone", { mentions: [{ type: "skill", name: "gone", from: 0, to: 5 }] });
    expect(texts(prompt)[1]).toContain("- gone: not available in this run");
  });

  test("the transcript keeps the mentions, and drops one that does not fit its token", () => {
    const message = sent("fix @src/app.ts with /writing-skills", {
      mentions: [file, skill],
      skills: listing,
    });
    const [user] = messagesToChat([message]);
    expect(user?.parts).toEqual([{ type: "text", text: "fix @src/app.ts with /writing-skills" }]);
    expect(user?.mentions).toEqual([file, skill]);
    expect(user && "attachments" in user).toBe(false);

    const [odd] = messagesToChat([
      { ...message, metadata: { prompt: "x", mentions: [{ ...file, to: 99 }, "no"] } },
    ]);
    expect(odd?.parts).toEqual([{ type: "text", text: "x" }]);
    expect(odd && "mentions" in odd).toBe(false);
  });
});
