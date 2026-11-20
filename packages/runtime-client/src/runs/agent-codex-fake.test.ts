import { describe, expect, test } from "bun:test";
import { createTool } from "@anvia/core";
import { z } from "zod";

import { codexQueryForProcess } from "./agent-backends";
import { CODEX_FAKE_REPLY, codexFakeQuery } from "@aven/codex/fake";
import { codexSdkQuery } from "@aven/codex/sdk";
import type { CodexQueryInput, CodexSdkEvent } from "@aven/codex/types";

const TOKEN = "sk-codex-for-the-fake-0001";

function input(): CodexQueryInput {
  return {
    prompt: "look at this folder",
    images: [],
    token: TOKEN,
    cwd: "/work",
    codexHome: "/runner/codex/thread",
    mcpUrl: "http://127.0.0.1:9/mcp",
    mcpToken: "mcp-token-for-the-fake",
    abortController: new AbortController(),
    tools: { catalog: [] },
    env: [],
    redact: (text) => text,
  };
}

async function taken(query: ReturnType<typeof codexFakeQuery>) {
  const messages: CodexSdkEvent[] = [];
  for await (const message of query) messages.push(message);
  return messages;
}

describe("a fake Codex query for tests", () => {
  test("answers locally and does not repeat the API key", async () => {
    const messages = await taken(codexFakeQuery(input()));
    expect(messages.map((message) => message.type)).toEqual([
      "thread.started",
      "item.completed",
      "turn.completed",
    ]);
    expect(JSON.stringify(messages)).toContain(CODEX_FAKE_REPLY);
    expect(JSON.stringify(messages)).not.toContain(TOKEN);
  });

  test("the runner uses it only when AVEN_CODEX_FAKE is 1", () => {
    expect(codexQueryForProcess({ AVEN_CODEX_FAKE: "1" })).toBe(codexFakeQuery);
    expect(codexQueryForProcess({})).toBe(codexSdkQuery);
    expect(codexQueryForProcess({ AVEN_CODEX_FAKE: "0" })).toBe(codexSdkQuery);
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
    const messages = await taken(codexFakeQuery({ ...input(), tools: { catalog: [send] } }));

    expect(sent).toEqual([{ to: "user", text: CODEX_FAKE_REPLY }]);
    expect(messages.map((message) => message.type)).toEqual([
      "thread.started",
      "item.started",
      "item.completed",
      "turn.completed",
    ]);
    expect(JSON.stringify(messages)).toContain("Sent to the person.");
  });
});
