import { describe, expect, test } from "bun:test";

import {
  createSendMessageTool,
  SEND_MESSAGE_TOOL_NAME,
  type SendMessageInput,
} from "./send-message";

const input = (message: { to?: string; text: string }) => message as SendMessageInput;

describe("send_message", () => {
  test("goes to the person unless it says another, and hands the host what it was sent", async () => {
    const sent: SendMessageInput[] = [];
    const tool = createSendMessageTool(async (message) => (sent.push(message), "Sent"));

    expect(tool.name).toBe(SEND_MESSAGE_TOOL_NAME);
    expect(await tool.call(input({ text: " hey " }))).toBe("Sent");
    await tool.call({ to: "scout", text: "do A" });

    expect(sent).toEqual([
      { to: "user", text: "hey" },
      { to: "scout", text: "do A" },
    ]);
  });

  test("nothing to say or nobody to say it to is refused before the host is asked", async () => {
    const sent: SendMessageInput[] = [];
    const tool = createSendMessageTool(async (message) => (sent.push(message), "Sent"));

    await expect(tool.call(input({ text: "  " }))).rejects.toThrow();
    await expect(tool.call({ to: " ", text: "hi" })).rejects.toThrow();
    expect(sent).toEqual([]);
  });

  test("a refusal of the host reaches the model as the tool's error", async () => {
    const tool = createSendMessageTool(async () => {
      throw new Error('No bot with the handle "ghost"');
    });
    await expect(tool.call({ to: "ghost", text: "hi" })).rejects.toThrow("No bot");
  });
});
