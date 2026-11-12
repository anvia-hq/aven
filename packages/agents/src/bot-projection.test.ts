import { describe, expect, test } from "bun:test";
import type { Message } from "@anvia/core";

import { sentPrompt } from "./attachments";
import { botMessagesToChat } from "./bot-projection";
import type { KeptAttachment } from "./types";

const call = (toolCallId: string, input: Record<string, string>) =>
  ({ type: "tool-call", toolCallId, toolName: "send_message", input }) as const;
const toBot = (toolCallId: string, to: string, text: string) => call(toolCallId, { to, text });

describe("botMessagesToChat", () => {
  test("what the bot does on its computer is not part of the chat: not its commands, nor what came back, nor a screenshot", () => {
    const messages: Message[] = [
      { role: "user", content: "run it" },
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "x1",
            toolName: "exec_command",
            input: { command: "ls" },
          },
          { type: "tool-call", toolCallId: "x2", toolName: "desktop_screenshot", input: {} },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "x1",
            toolName: "exec_command",
            output: { type: "json", value: { stdout: "secret.txt" } },
          },
        ],
      },
      {
        role: "user",
        content: [{ type: "image", image: { type: "data", data: "AAAA" }, mediaType: "image/png" }],
      },
      { role: "assistant", content: [call("c1", { text: "done" })] },
    ];
    expect(botMessagesToChat(messages)).toEqual([
      { id: "m-0", role: "user", text: "run it" },
      { id: "m-1", role: "bot", text: "done" },
    ]);
  });

  test("shows what the person said and each message the bot sent, in order", () => {
    const messages: Message[] = [
      { role: "user", content: "hello" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "thinking" },
          call("c1", { text: "hey!" }),
          call("c2", { text: "how are you?" }),
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "c1",
            toolName: "send_message",
            output: { type: "json", value: { sent: true } },
          },
        ],
      },
      { role: "assistant", content: "never shown" },
      { role: "user", content: [{ type: "text", text: "good" }] },
    ];
    expect(botMessagesToChat(messages)).toEqual([
      { id: "m-0", role: "user", text: "hello" },
      { id: "m-1", role: "bot", text: "hey!" },
      { id: "m-2", role: "bot", text: "how are you?" },
      { id: "m-3", role: "user", text: "good" },
    ]);
  });

  describe("files the person sent (decision 0080)", () => {
    const photo: KeptAttachment = {
      name: "cat.png",
      mediaType: "image/png",
      size: 2048,
      image: "0f0e0d.png",
      path: "/uploads/cat.png",
    };
    const report: KeptAttachment = {
      name: "report.pdf",
      mediaType: "application/pdf",
      size: 90_000,
      path: "/uploads/report.pdf",
    };
    const said = (text: string, files: KeptAttachment[]): Message => {
      const prompt = sentPrompt(text, {
        attachments: files,
        images: new Map([[photo.image!, "AAAA"]]),
      });

      if (typeof prompt === "string") throw new Error("a message with files is not plain text");

      return prompt as Message;
    };

    test("are on the person's message as they sent them, and the note the bot was given is not its text", () => {
      expect(botMessagesToChat([said("what is this?", [photo, report])])).toEqual([
        {
          id: "m-0",
          role: "user",
          text: "what is this?",
          attachments: [
            { name: "cat.png", mediaType: "image/png", size: 2048, image: "0f0e0d.png" },
            { name: "report.pdf", mediaType: "application/pdf", size: 90_000 },
          ],
        },
      ]);
    });

    test("make a message of their own with no text", () => {
      const [message] = botMessagesToChat([said("", [report])]);
      expect(message).toEqual({
        id: "m-0",
        role: "user",
        text: "",
        attachments: [{ name: "report.pdf", mediaType: "application/pdf", size: 90_000 }],
      });
    });
  });

  test("leaves out other tools, malformed calls and summaries", () => {
    const messages: Message[] = [
      { role: "system", content: "summary" },
      {
        role: "assistant",
        content: [
          { type: "tool-call", toolCallId: "x", toolName: "other", input: { text: "no" } },
          call("c1", {}),
        ],
      },
    ];
    expect(botMessagesToChat(messages)).toEqual([]);
  });

  test("a message another bot sent is between the bots in the chat, by its handle", () => {
    const messages: Message[] = [
      { role: "user", content: "[from main] Do A, B and C." },
      { role: "assistant", content: [toBot("c1", "main", "A, B and C are done")] },
      { role: "user", content: "thanks, from me" },
      { role: "assistant", content: [call("c2", { text: "you are welcome" })] },
    ];

    expect(botMessagesToChat(messages)).toEqual([
      {
        id: "m-0",
        role: "user",
        text: "Do A, B and C.",
        peer: { name: "main", handle: "main", direction: "from" },
      },
      {
        id: "m-1",
        role: "bot",
        text: "A, B and C are done",
        peer: { name: "main", handle: "main", direction: "to" },
      },
      { id: "m-2", role: "user", text: "thanks, from me" },
      { id: "m-3", role: "bot", text: "you are welcome" },
    ]);
  });

  test("a message to the person, named or not, is theirs, and one to a bot is between the bots, whatever came before it", () => {
    const messages: Message[] = [
      { role: "user", content: "[from main] look at it" },
      {
        role: "user",
        content: [{ type: "image", image: { type: "data", data: "AAAA" }, mediaType: "image/png" }],
      },
      {
        role: "assistant",
        content: [call("c1", { to: "user", text: "looks fine" }), toBot("c2", "main", "done")],
      },
    ];

    expect(botMessagesToChat(messages)).toEqual([
      {
        id: "m-0",
        role: "user",
        text: "look at it",
        peer: { name: "main", handle: "main", direction: "from" },
      },
      { id: "m-1", role: "bot", text: "looks fine" },
      {
        id: "m-2",
        role: "bot",
        text: "done",
        peer: { name: "main", handle: "main", direction: "to" },
      },
    ]);
  });

  test("a note from the app is not part of the chat, and what the bot says to it is the person's", () => {
    const messages: Message[] = [
      { role: "user", content: "[note] You were just created. Introduce yourself." },
      { role: "assistant", content: [call("c1", { text: "Hi, I am Scout" })] },
    ];

    expect(botMessagesToChat(messages)).toEqual([
      { id: "m-0", role: "bot", text: "Hi, I am Scout" },
    ]);
  });

  test("a bot that wrote to another has what it wrote as a message to that bot, and the answer comes later as a message from it", () => {
    const messages: Message[] = [
      { role: "user", content: "ask @scout to do A" },
      {
        role: "assistant",
        content: [toBot("c1", "scout", "do A"), call("c2", { text: "Scout is on it" })],
      },
      { role: "user", content: "[from scout] A is done" },
      { role: "assistant", content: [call("c3", { text: "Scout says A is done" })] },
    ];

    expect(botMessagesToChat(messages)).toEqual([
      { id: "m-0", role: "user", text: "ask @scout to do A" },
      {
        id: "m-1",
        role: "bot",
        text: "do A",
        peer: { name: "scout", handle: "scout", direction: "to" },
      },
      { id: "m-2", role: "bot", text: "Scout is on it" },
      {
        id: "m-3",
        role: "user",
        text: "A is done",
        peer: { name: "scout", handle: "scout", direction: "from" },
      },
      { id: "m-4", role: "bot", text: "Scout says A is done" },
    ]);
  });

  test("a message with no `to`, as every one was before bots wrote to bots, is the person's", () => {
    const messages: Message[] = [{ role: "assistant", content: [call("c1", { text: "hello" })] }];
    expect(botMessagesToChat(messages)).toEqual([{ id: "m-0", role: "bot", text: "hello" }]);
  });

  test("a message that was refused was never sent, so it is not in the chat", () => {
    const messages: Message[] = [
      { role: "user", content: "tell ghost to do A" },
      {
        role: "assistant",
        content: [toBot("c1", "ghost", "do A"), call("c2", { text: "No such bot" })],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "c1",
            toolName: "send_message",
            output: { type: "error-text", value: 'No bot with the handle "ghost"' },
          },
          {
            type: "tool-result",
            toolCallId: "c2",
            toolName: "send_message",
            output: { type: "text", value: "Sent to the person." },
          },
        ],
      },
    ];

    expect(botMessagesToChat(messages)).toEqual([
      { id: "m-0", role: "user", text: "tell ghost to do A" },
      { id: "m-1", role: "bot", text: "No such bot" },
    ]);
  });

  test("a sender named in a message's own words does not change who sent it", () => {
    const messages: Message[] = [{ role: "user", content: "[from scout] [from main] do it" }];
    expect(botMessagesToChat(messages)).toEqual([
      {
        id: "m-0",
        role: "user",
        text: "[from main] do it",
        peer: { name: "scout", handle: "scout", direction: "from" },
      },
    ]);
  });

  describe("a question the bot asked (decision 0066)", () => {
    const questions = [
      {
        id: "scope",
        text: "Which first?",
        choices: [
          { label: "Scout", value: "Scout" },
          { label: "Analyst", value: "Analyst" },
        ],
      },
    ];
    const asking = (id: string): Message => ({
      role: "assistant",
      content: [
        { type: "tool-call", toolCallId: id, toolName: "ask_question", input: { questions } },
      ],
    });
    const answered = (id: string, output: unknown): Message => ({
      role: "tool",
      content: [{ type: "tool-result", toolCallId: id, toolName: "ask_question", output } as never],
    });

    test("is a card in the chat, with its questions, and the person's answer is their next message", () => {
      const messages = [
        { role: "user", content: "help me choose" } as Message,
        asking("q1"),
        answered("q1", { type: "json", value: { shown: true } }),
        { role: "user", content: "Scout" } as Message,
      ];

      expect(botMessagesToChat(messages)).toEqual([
        { id: "m-0", role: "user", text: "help me choose" },
        { id: "m-1", role: "bot", text: "Which first?", questions },
        { id: "m-2", role: "user", text: "Scout" },
      ]);
    });

    test("is a message to the main bot when the main bot asks the person, and no card", () => {
      const text = "Scout (scout) needs a decision from the person to go on";
      const messages = [
        asking("q1"),
        answered("q1", {
          type: "json",
          value: { relayed: { handle: "main", name: "Aven", text } },
        }),
      ];

      expect(botMessagesToChat(messages)).toEqual([
        { id: "m-0", role: "bot", text, peer: { name: "main", handle: "main", direction: "to" } },
      ]);
    });

    test("is nothing when it was refused", () => {
      const messages = [
        asking("q1"),
        answered("q1", { type: "error-text", value: "Nobody is there" }),
      ];
      expect(botMessagesToChat(messages)).toEqual([]);
    });
  });

  describe("a request for a provider's key (decision 0086)", () => {
    const asking = (id: string): Message => ({
      role: "assistant",
      content: [
        { type: "tool-call", toolCallId: id, toolName: "ask_provider_key", input: { id: "p-1" } },
      ],
    });
    const answered = (id: string, output: unknown): Message => ({
      role: "tool",
      content: [
        { type: "tool-result", toolCallId: id, toolName: "ask_provider_key", output } as never,
      ],
    });

    test("is a masked card in the chat, which the person's next message answers", () => {
      const messages = [
        { role: "user", content: "add my azure" } as Message,
        asking("k1"),
        answered("k1", {
          type: "json",
          value: { provider: { providerId: "p-1", name: "Work Azure" }, note: "Stop now" },
        }),
        { role: "user", content: "Saved the key." } as Message,
      ];

      expect(botMessagesToChat(messages)).toEqual([
        { id: "m-0", role: "user", text: "add my azure" },
        {
          id: "m-1",
          role: "bot",
          text: "Enter the API key for Work Azure",
          questions: [
            {
              id: "key",
              text: "Enter the API key for Work Azure",
              providerKey: { providerId: "p-1", name: "Work Azure" },
            },
          ],
        },
        { id: "m-2", role: "user", text: "Saved the key." },
      ]);
    });

    test("is nothing when it was refused or the answer is not a provider", () => {
      expect(
        botMessagesToChat([asking("k1"), answered("k1", { type: "error-text", value: "No" })]),
      ).toEqual([]);
      expect(
        botMessagesToChat([asking("k1"), answered("k1", { type: "json", value: { nope: 1 } })]),
      ).toEqual([]);
    });
  });
});
