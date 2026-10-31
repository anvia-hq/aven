import { describe, expect, test } from "bun:test";
import type { Message } from "@anvia/core";

import { botMessagesToChat } from "./bot-projection";

const call = (toolCallId: string, input: Record<string, string>) =>
  ({ type: "tool-call", toolCallId, toolName: "send_message", input }) as const;

describe("botMessagesToChat", () => {
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
});
