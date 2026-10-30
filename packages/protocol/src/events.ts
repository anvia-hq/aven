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

export type MessagePart = { type: "text"; text: string } | { type: "tool"; tool: ToolPart };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
};

export type RunEvent =
  /** Full transcript, sent when a client connects. Replaces whatever it had. */
  | { type: "snapshot"; messages: ChatMessage[]; running: boolean; context?: ContextUsage }
  | { type: "run_start"; prompt: string }
  | { type: "text"; delta: string }
  | { type: "tool_start"; tool: ToolPart }
  | { type: "tool_end"; id: string; status: "done" | "error"; output?: string }
  | ({ type: "context" } & ContextUsage)
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
