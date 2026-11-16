import { SEND_MESSAGE_TOOL_NAME } from "@aven/agents/tools/send-message";
import { USER_HANDLE } from "@aven/protocol/bots";

import { callAvenTool } from "./claude-mcp";
import type { ClaudeQuery, ClaudeSdkMessage } from "@aven/agent-backend/types";

export const CLAUDE_FAKE_REPLY = "The Claude backend is answering this thread.";

const SESSION = "claude-fake-session";

const sendsAMessage = (input: Parameters<ClaudeQuery>[0]) =>
  input.tools.catalog?.some((tool) => tool.name === SEND_MESSAGE_TOOL_NAME) === true;

async function botTurn(input: Parameters<ClaudeQuery>[0]): Promise<ClaudeSdkMessage[]> {
  const id = "claude-fake-send";
  const call = { to: USER_HANDLE, text: CLAUDE_FAKE_REPLY };
  const result = await callAvenTool(SEND_MESSAGE_TOOL_NAME, call, input.tools);
  return [
    {
      type: "assistant",
      session_id: SESSION,
      message: {
        content: [{ type: "tool_use", id, name: SEND_MESSAGE_TOOL_NAME, input: call }],
      },
    },
    {
      type: "user",
      session_id: SESSION,
      message: { content: [{ type: "tool_result", tool_use_id: id, content: result }] },
    },
    {
      type: "result",
      subtype: "success",
      session_id: SESSION,
      usage: { input_tokens: 3, output_tokens: 8 },
    },
  ];
}

export const claudeFakeQuery: ClaudeQuery = (input) => {
  let stopped = false;
  const stream = (async function* () {
    for await (const item of input.prompt) {
      const text = typeof item === "string" ? item : item.text;

      if (stopped || input.abortController.signal.aborted) return;

      if (text.trim() === "") continue;

      if (sendsAMessage(input)) {
        for (const message of await botTurn(input)) {
          if (stopped || input.abortController.signal.aborted) return;

          yield message;
        }
        return;
      }

      yield {
        type: "assistant" as const,
        session_id: SESSION,
        message: { content: [{ type: "text", text: CLAUDE_FAKE_REPLY }] },
      };
      yield {
        type: "result" as const,
        subtype: "success",
        session_id: SESSION,
        usage: { input_tokens: 3, output_tokens: 8 },
      };
      return;
    }
  })();
  return Object.assign(stream, {
    close() {
      stopped = true;
      input.abortController.abort();
    },
  });
};
