import { describe, expect, test } from "bun:test";
import type { Message } from "@anvia/core";

import { botMessagesToChat } from "./bot-projection";
import { messagesToChat } from "./projection";
import { createToolUiRecorder, readToolUi } from "./tool-ui";

describe("tool UI metadata separation", () => {
  test("attaches out-of-band UI metadata onto persisted tool messages without polluting LLM text", () => {
    const recorder = createToolUiRecorder();
    const artifacts = [
      {
        name: "00000000-0000-4000-8000-000000000001.png",
        mediaType: "image/png",
        caption: "Sales",
      },
    ];
    recorder.record("show_artifact", "Showed plot.png.", { artifacts });

    expect(recorder.takeLive("show_artifact", "Showed plot.png.")).toEqual({ artifacts });

    const messages: Message[] = [
      { role: "user", content: "show me" },
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "a1",
            toolName: "show_artifact",
            input: { items: [{ path: "plot.png", caption: "Sales" }] },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "a1",
            toolName: "show_artifact",
            output: { type: "text", value: "Showed plot.png." },
          },
        ],
      },
    ];
    const attached = recorder.attach(messages);

    expect(readToolUi(attached[2], "a1")).toEqual({ artifacts });
    expect(messagesToChat(attached)[1]?.parts).toEqual([
      {
        type: "tool",
        tool: {
          id: "a1",
          name: "show_artifact",
          target: "plot.png",
          status: "done",
          output: "Showed plot.png.",
          artifacts,
        },
      },
    ]);
  });

  test("projects bot artifacts, relayed questions, and provider key prompts from toolUi metadata", () => {
    const recorder = createToolUiRecorder();
    const fileArtifact = {
      name: "00000000-0000-4000-8000-000000000002.pdf",
      mediaType: "application/pdf",
      title: "Report",
      size: 42,
    };
    recorder.record("send_message", "Sent to the person with 1 file(s): Report.", {
      artifacts: [fileArtifact],
    });
    recorder.record(
      "ask_question",
      "Aven will ask the person for you and send you the answer as a message. Stop now and send nothing else.",
      { relayed: { handle: "main", text: "Scout needs a decision" } },
    );
    recorder.record("ask_provider_key", "Requested API key for Claude.", {
      provider: { providerId: "p-1", name: "Claude" },
    });

    const messages: Message[] = [
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "m1",
            toolName: "send_message",
            input: { text: "here", files: [{ path: "report.pdf", title: "Report" }] },
          },
          {
            type: "tool-call",
            toolCallId: "q1",
            toolName: "ask_question",
            input: {
              questions: [
                {
                  id: "go",
                  text: "Proceed?",
                  choices: [
                    { label: "Yes", value: "Yes" },
                    { label: "No", value: "No" },
                  ],
                },
              ],
            },
          },
          {
            type: "tool-call",
            toolCallId: "k1",
            toolName: "ask_provider_key",
            input: { id: "p-1" },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "m1",
            toolName: "send_message",
            output: { type: "text", value: "Sent to the person with 1 file(s): Report." },
          },
          {
            type: "tool-result",
            toolCallId: "q1",
            toolName: "ask_question",
            output: {
              type: "text",
              value:
                "Aven will ask the person for you and send you the answer as a message. Stop now and send nothing else.",
            },
          },
          {
            type: "tool-result",
            toolCallId: "k1",
            toolName: "ask_provider_key",
            output: { type: "text", value: "Requested API key for Claude." },
          },
        ],
      },
    ];

    const chat = botMessagesToChat(recorder.attach(messages));
    expect(chat).toEqual([
      { id: "b-0", role: "bot", text: "here", artifacts: [fileArtifact] },
      {
        id: "b-1",
        role: "bot",
        text: "Scout needs a decision",
        peer: { name: "main", handle: "main", direction: "to" },
      },
      {
        id: "b-2",
        role: "bot",
        text: "Enter the API key for Claude",
        questions: [
          {
            id: "key",
            text: "Enter the API key for Claude",
            providerKey: { providerId: "p-1", name: "Claude" },
          },
        ],
      },
    ]);
  });
});
