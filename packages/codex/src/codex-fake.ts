import type { CodexQuery } from "@aven/agent-backend/types";

export const CODEX_FAKE_REPLY = "The Codex backend is answering this thread.";

export const codexFakeQuery: CodexQuery = (input) => {
  let stopped = false;
  const stream = (async function* () {
    if (stopped || input.abortController.signal.aborted) return;

    if (input.prompt.trim() === "") return;

    const sessionId = input.sessionId ?? "codex-fake-session";
    yield { type: "thread.started" as const, thread_id: sessionId };
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
