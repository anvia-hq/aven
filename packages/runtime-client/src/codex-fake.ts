import type { ThreadEvent } from "@openai/codex-sdk";

import type { codexConfig, codexThreadOptions } from "./codex-process";

export const CODEX_FAKE_REPLY = "The Codex backend is answering this thread.";

export const CODEX_FAKE_SESSION = "codex-fake-session";

export type CodexQueryInput = {
  sessionId?: string;
  prompt: string;
  images: readonly string[];
  signal: AbortSignal;
  env: Record<string, string>;
  config: ReturnType<typeof codexConfig>;
  thread: ReturnType<typeof codexThreadOptions>;
  callTool?: (name: string, args: unknown) => Promise<string>;
};

export type CodexQuery = (input: CodexQueryInput) => AsyncGenerator<ThreadEvent>;

export async function* codexFakeQuery(input: CodexQueryInput): AsyncGenerator<ThreadEvent> {
  if (input.signal.aborted) return;

  const sessionId = input.sessionId ?? CODEX_FAKE_SESSION;
  yield { type: "thread.started", thread_id: sessionId };
  const text = input.prompt.includes("/compact")
    ? "Compacted the Codex session."
    : CODEX_FAKE_REPLY;
  yield { type: "item.completed", item: { id: "codex-fake-message", type: "agent_message", text } };
  yield {
    type: "turn.completed",
    usage: {
      input_tokens: 3,
      cached_input_tokens: 0,
      cache_write_input_tokens: 0,
      output_tokens: 2,
      reasoning_output_tokens: 0,
    },
  };
}

export function codexQueryForProcess(
  env: Record<string, string | undefined> = process.env,
): CodexQuery {
  return env.AVEN_CODEX_FAKE === "1" ? codexFakeQuery : codexSdkQuery;
}

async function* codexSdkQuery(input: CodexQueryInput): AsyncGenerator<ThreadEvent> {
  const { Codex } = await import("@openai/codex-sdk");
  const codex = new Codex({ env: input.env, config: input.config });
  const thread = input.sessionId
    ? codex.resumeThread(input.sessionId, input.thread)
    : codex.startThread(input.thread);
  const content = input.images.length
    ? [
        { type: "text" as const, text: input.prompt },
        ...input.images.map((path) => ({ type: "local_image" as const, path })),
      ]
    : input.prompt;
  const streamed = await thread.runStreamed(content, { signal: input.signal });
  yield* streamed.events;
}
