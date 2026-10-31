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

  test("a message another bot sent is the other bot's in the chat, without the prefix the bot was given", () => {
    const messages: Message[] = [
      { role: "user", content: "[from bot Aven] Do A, B and C." },
      { role: "assistant", content: [call("c1", { text: "A, B and C are done" })] },
      { role: "user", content: "thanks, from me" },
    ];

    expect(botMessagesToChat(messages)).toEqual([
      { id: "m-0", role: "user", text: "Do A, B and C.", from: "Aven" },
      { id: "m-1", role: "bot", text: "A, B and C are done" },
      { id: "m-2", role: "user", text: "thanks, from me" },
    ]);
  });
});
