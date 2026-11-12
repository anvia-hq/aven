import type { ClaudeQuery } from "./types";

export const CLAUDE_FAKE_REPLY = "The Claude backend is answering this thread.";

export const claudeFakeQuery: ClaudeQuery = (input) => {
  let stopped = false;
  const stream = (async function* () {
    const sessionId = "claude-fake-session";
    for await (const text of input.prompt) {
      if (stopped || input.abortController.signal.aborted) return;

      if (text.trim() === "") continue;

      yield {
        type: "assistant" as const,
        session_id: sessionId,
        message: { content: [{ type: "text", text: CLAUDE_FAKE_REPLY }] },
      };
      yield {
        type: "result" as const,
        subtype: "success",
        session_id: sessionId,
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
