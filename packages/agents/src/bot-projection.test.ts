import { describe, expect, test } from "bun:test";
import type { Message } from "@anvia/core";

import { botMessagesToChat } from "./bot-projection";

const call = (toolCallId: string, input: Record<string, string>) =>
  ({ type: "tool-call", toolCallId, toolName: "send_message", input }) as const;

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

  test("a message another bot sent is between the bots in the chat, and so is what the bot said back, without the prefix", () => {
    const messages: Message[] = [
      { role: "user", content: "[from bot Aven] Do A, B and C." },
      { role: "assistant", content: [call("c1", { text: "A, B and C are done" })] },
      { role: "user", content: "thanks, from me" },
      { role: "assistant", content: [call("c2", { text: "you are welcome" })] },
    ];

    expect(botMessagesToChat(messages)).toEqual([
      {
        id: "m-0",
        role: "user",
        text: "Do A, B and C.",
        peer: { name: "Aven", direction: "from" },
      },
      {
        id: "m-1",
        role: "bot",
        text: "A, B and C are done",
        peer: { name: "Aven", direction: "to" },
      },
      { id: "m-2", role: "user", text: "thanks, from me" },
      { id: "m-3", role: "bot", text: "you are welcome" },
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

  test("a bot that wrote to another has what it wrote and what came back as messages between bots", () => {
    const scout = "11111111-2222-4333-8444-555555555555";
    const messages: Message[] = [
      { role: "user", content: "ask @Scout to do A" },
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "m1",
            toolName: "message_bot",
            input: { bot: scout, text: "do A" },
          },
          call("c1", { text: "Scout is on it" }),
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "m1",
            toolName: "message_bot",
            output: { type: "json", value: { bot: "Scout", replies: ["A is done", "and tested"] } },
          },
          {
            type: "tool-result",
            toolCallId: "c1",
            toolName: "send_message",
            output: { type: "json", value: { sent: true } },
          },
        ],
      },
    ];

    expect(botMessagesToChat(messages)).toEqual([
      { id: "m-0", role: "user", text: "ask @Scout to do A" },
      { id: "m-1", role: "bot", text: "do A", peer: { name: "Scout", id: scout, direction: "to" } },
      {
        id: "m-2",
        role: "user",
        text: "A is done",
        peer: { name: "Scout", id: scout, direction: "from" },
      },
      {
        id: "m-3",
        role: "user",
        text: "and tested",
        peer: { name: "Scout", id: scout, direction: "from" },
      },
      { id: "m-4", role: "bot", text: "Scout is on it" },
    ]);
  });

  test("a call to another bot that has no answer yet is only what was written", () => {
    const scout = "11111111-2222-4333-8444-555555555555";
    const messages: Message[] = [
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "m1",
            toolName: "message_bot",
            input: { bot: scout, text: "do A" },
          },
        ],
      },
    ];

    expect(botMessagesToChat(messages)).toEqual([
      { id: "m-0", role: "bot", text: "do A", peer: { name: "a bot", id: scout, direction: "to" } },
    ]);
  });

  test("a screenshot after a bot's message does not end that it is answering the bot", () => {
    const messages: Message[] = [
      { role: "user", content: "[from bot Aven] look at it" },
      {
        role: "user",
        content: [{ type: "image", image: { type: "data", data: "AAAA" }, mediaType: "image/png" }],
      },
      { role: "assistant", content: [call("c1", { text: "looks fine" })] },
    ];
    expect(botMessagesToChat(messages)).toEqual([
      { id: "m-0", role: "user", text: "look at it", peer: { name: "Aven", direction: "from" } },
      { id: "m-1", role: "bot", text: "looks fine", peer: { name: "Aven", direction: "to" } },
    ]);
  });

  test("a provider that reuses a call's id for another bot's call does not give one bot the other's answer", () => {
    const scout = "11111111-2222-4333-8444-555555555555";
    const pip = "66666666-7777-4888-8999-000000000000";
    const asking = (bot: string, text: string): Message => ({
      role: "assistant",
      content: [
        { type: "tool-call", toolCallId: "call_0", toolName: "message_bot", input: { bot, text } },
      ],
    });
    const answered = (bot: string, reply: string): Message => ({
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "call_0",
          toolName: "message_bot",
          output: { type: "json", value: { bot, replies: [reply] } },
        },
      ],
    });
    const messages = [
      asking(scout, "one"),
      answered("Scout", "uno"),
      asking(pip, "two"),
      answered("Pip", "dos"),
    ];

    const chat = botMessagesToChat(messages);
    expect(chat.map((m) => [m.text, m.peer?.name, m.peer?.direction])).toEqual([
      ["one", "Scout", "to"],
      ["uno", "Scout", "from"],
      ["two", "Pip", "to"],
      ["dos", "Pip", "from"],
    ]);
  });
});
