import { describe, expect, test } from "bun:test";
import type { Message } from "@anvia/core";

import { botMessagesToChat } from "./bot-projection";

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
});
