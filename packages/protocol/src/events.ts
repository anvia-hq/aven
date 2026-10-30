// The wire protocol between the control plane and every client (web, macOS, ...) and runtime.
// Types plus a pure reducer, with no runtime imports, so clients can bundle it.

export type DiffLine = { type: "add" | "del" | "ctx"; text: string };

export type ToolPart = {
  id: string;
  name: string;
  /** What the tool acted on: a path, command or query. */
  target: string;
  status: "running" | "done" | "error";
  diff?: DiffLine[];
  output?: string;
};

/** How much of the model's context window the conversation fills, as of the latest model call. */
export type ContextUsage = { usedTokens: number; contextWindow: number };

/** Tokens a model used. `inputTokens` is all of the input; the cache figures are the parts of it written to and read from the cache. */
export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
};

/** What a thread has used so far, and how full the model's context is as of its latest call. */
export type ThreadUsage = { totals: TokenUsage; context?: ContextUsage };

export const NO_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
};

export function addUsage(left: TokenUsage, right: TokenUsage): TokenUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
  };
}

/** The thread's usage after one more model call. */
export function applyUsage(
  usage: ThreadUsage | null,
  event: { turn: TokenUsage; context?: ContextUsage },
): ThreadUsage {
  return {
    totals: addUsage(usage?.totals ?? NO_USAGE, event.turn),
    context: event.context ?? usage?.context,
  };
}

export type MessagePart = { type: "text"; text: string } | { type: "tool"; tool: ToolPart };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
};

export type RunEvent =
  /** Full transcript, sent when a client connects. Replaces whatever it had. */
  | { type: "snapshot"; messages: ChatMessage[]; running: boolean; usage?: ThreadUsage }
  | { type: "run_start"; prompt: string }
  | { type: "text"; delta: string }
  | { type: "tool_start"; tool: ToolPart }
  | { type: "tool_end"; id: string; status: "done" | "error"; output?: string }
  | { type: "usage"; turn: TokenUsage; context?: ContextUsage }
  | { type: "done" }
  | { type: "error"; message: string };

/** The id of the message at `index` in a transcript; the reducer and stored-message rebuilds agree on it. */
export function messageId(index: number) {
  return `m-${index}`;
}

export function isRunning(previous: boolean, event: RunEvent) {
  switch (event.type) {
    case "snapshot":
      return event.running;
    case "run_start":
      return true;
    case "done":
    case "error":
      return false;
    default:
      return previous;
  }
}

function updateLastAssistant(
  messages: ChatMessage[],
  change: (parts: MessagePart[]) => MessagePart[],
) {
  const index = messages.findLastIndex((message) => message.role === "assistant");
  if (index === -1) return messages;
  return messages.map((message, at) =>
    at === index ? { ...message, parts: change(message.parts) } : message,
  );
}

// Applies one event to a transcript. The server uses it to build snapshots; clients use it to
// render live, so both always agree.
export function applyEvent(messages: ChatMessage[], event: RunEvent): ChatMessage[] {
  switch (event.type) {
    case "snapshot":
      return event.messages;
    case "run_start":
      return [
        ...messages,
        {
          id: messageId(messages.length),
          role: "user",
          parts: [{ type: "text", text: event.prompt }],
        },
        { id: messageId(messages.length + 1), role: "assistant", parts: [] },
      ];
    case "text":
      return updateLastAssistant(messages, (parts) => {
        const last = parts.at(-1);
        if (last?.type === "text") {
          return [...parts.slice(0, -1), { type: "text", text: last.text + event.delta }];
        }
        return [...parts, { type: "text", text: event.delta }];
      });
    case "tool_start":
      return updateLastAssistant(messages, (parts) => [
        ...parts,
        { type: "tool", tool: event.tool },
      ]);
    case "tool_end":
      return updateLastAssistant(messages, (parts) =>
        parts.map((part) =>
          part.type === "tool" && part.tool.id === event.id
            ? { type: "tool", tool: { ...part.tool, status: event.status, output: event.output } }
            : part,
        ),
      );
    default:
      // `done` and `error` do not change the transcript; clients show an error as it arrives
      // (see isRunning) and every client's reducer must agree, per fixtures/reducer.json.
      return messages;
  }
}
