import { callAvenTool } from "@aven/agent-backend/mcp";
import { SEND_MESSAGE_TOOL_NAME } from "@aven/agents/tools/send-message";
import { USER_HANDLE } from "@aven/protocol/bots";

import type { CodexQuery, CodexSdkEvent } from "./types";

export const CODEX_FAKE_REPLY = "The Codex backend is answering this thread.";

const SESSION = "codex-fake-session";

const sendsAMessage = (input: Parameters<CodexQuery>[0]) =>
  input.tools.catalog?.some((tool) => tool.name === SEND_MESSAGE_TOOL_NAME) === true;

async function botTurn(input: Parameters<CodexQuery>[0]): Promise<CodexSdkEvent[]> {
  const id = "codex-fake-send";
  const call = { to: USER_HANDLE, text: CODEX_FAKE_REPLY };
  const result = await callAvenTool(SEND_MESSAGE_TOOL_NAME, call, input.tools);
  const item = {
    id,
    type: "mcp_tool_call" as const,
    server: "aven",
    tool: SEND_MESSAGE_TOOL_NAME,
    arguments: call,
  };
  return [
    { type: "thread.started", thread_id: input.sessionId ?? SESSION },
    { type: "item.started", item: { ...item, status: "in_progress" } },
    {
      type: "item.completed",
      item: {
        ...item,
        status: "completed",
        result: { content: [{ type: "text", text: result }] },
      },
    },
    {
      type: "turn.completed",
      usage: {
        input_tokens: 3,
        cached_input_tokens: 0,
        cache_write_input_tokens: 0,
        output_tokens: 8,
        reasoning_output_tokens: 0,
      },
    },
  ];
}

export const codexFakeQuery: CodexQuery = (input) => {
  let stopped = false;
  const stream = (async function* () {
    if (stopped || input.abortController.signal.aborted) return;

    if (input.prompt.trim() === "") return;

    if (sendsAMessage(input)) {
      for (const event of await botTurn(input)) {
        if (stopped || input.abortController.signal.aborted) return;

        yield event;
      }
      return;
    }

    yield { type: "thread.started" as const, thread_id: input.sessionId ?? SESSION };
    yield {
      type: "item.completed" as const,
      item: { id: "reply", type: "agent_message" as const, text: CODEX_FAKE_REPLY },
    };
    yield {
      type: "turn.completed" as const,
      usage: {
        input_tokens: 3,
        cached_input_tokens: 0,
        cache_write_input_tokens: 0,
        output_tokens: 8,
        reasoning_output_tokens: 0,
      },
    };
  })();
  return Object.assign(stream, {
    close() {
      stopped = true;
      input.abortController.abort();
    },
  });
};
