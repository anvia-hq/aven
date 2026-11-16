import { describe, expect, test } from "bun:test";
import { createTool } from "@anvia/core";
import { z } from "zod";

import { claudeQueryForProcess } from "./agent-backends";
import { CLAUDE_FAKE_REPLY, claudeFakeQuery } from "@aven/claude/claude-fake";
import { claudeSdkQuery } from "@aven/claude/claude-sdk";
import type { ClaudeQueryInput, ClaudeSdkMessage } from "@aven/agent-backend/types";

const TOKEN = "setup-token-for-the-fake-0001";

async function* onePrompt() {
  yield "look at this folder";
}

function input(): ClaudeQueryInput {
  return {
    prompt: onePrompt(),
    token: TOKEN,
    cwd: "/work",
    binaryDir: "/unused",
    configDir: "/runner/claude/thread",
    abortController: new AbortController(),
    tools: { catalog: [] },
    env: [],
    redact: (text) => text,
  };
}

async function taken(query: ReturnType<typeof claudeFakeQuery>) {
  const messages: ClaudeSdkMessage[] = [];
  for await (const message of query) messages.push(message);
  return messages;
}

describe("a fake Claude query for tests", () => {
  test("answers locally and does not repeat the setup token", async () => {
    const messages = await taken(claudeFakeQuery(input()));
    expect(messages.map((message) => message.type)).toEqual(["assistant", "result"]);
    expect(JSON.stringify(messages)).toContain(CLAUDE_FAKE_REPLY);
    expect(JSON.stringify(messages)).not.toContain(TOKEN);
  });

  test("the runner uses it only when AVEN_CLAUDE_FAKE is 1", () => {
    expect(claudeQueryForProcess({ AVEN_CLAUDE_FAKE: "1" })).toBe(claudeFakeQuery);
    expect(claudeQueryForProcess({})).toBe(claudeSdkQuery);
    expect(claudeQueryForProcess({ AVEN_CLAUDE_FAKE: "0" })).toBe(claudeSdkQuery);
  });

  test("a bot is answered by sending it a message through its own tool", async () => {
    const sent: { to?: string; text: string }[] = [];
    const send = createTool({
      name: "send_message",
      description: "send",
      inputSchema: z.object({ to: z.string().optional(), text: z.string() }),
      handler: async (input) => {
        sent.push(input);
        return "Sent to the person.";
      },
    });
    const messages = await taken(claudeFakeQuery({ ...input(), tools: { catalog: [send] } }));

    expect(sent).toEqual([{ to: "user", text: CLAUDE_FAKE_REPLY }]);
    expect(messages.map((message) => message.type)).toEqual(["assistant", "user", "result"]);
    expect(JSON.stringify(messages)).toContain("Sent to the person.");
  });
});
