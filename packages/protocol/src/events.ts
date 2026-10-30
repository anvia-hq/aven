// The wire protocol between the control plane and every client (web, macOS, ...) and runtime.
// Types plus a pure reducer, with no runtime imports, so clients can bundle it.

export type DiffLine = { type: "add" | "del" | "ctx"; text: string };

export type QuestionChoice = { label: string; value: string };

/** One thing the agent asks the user. With `choices` the user picks one; `allowCustom` also lets them write their own answer. */
export type QuestionPrompt = {
  id: string;
  text: string;
  choices?: QuestionChoice[];
  allowCustom?: boolean;
};

export type QuestionAnswer = { questionId: string; value: string };

export const QUESTION_TOOL_NAME = "ask_user";

export const SHOW_IMAGE_TOOL_NAME = "show_image";

/** An image the agent showed the user (decision 0033). `name` is what `GET /threads/:id/artifacts/:name` serves it by. */
export type ToolImage = { name: string; mediaType: string; caption?: string };

export type ToolPart = {
  id: string;
  name: string;
  /** What the tool acted on: a path, command or query. */
  target: string;
  status: "running" | "done" | "error";
  diff?: DiffLine[];
  output?: string;
  /** Set on the agent's question tool: what it asks. While `status` is "running" and no run is live, it awaits an answer. */
  questions?: QuestionPrompt[];
  /** Set on the image tool once it is done: the image to show. */
  image?: ToolImage;
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
  /** The user answered the agent's question and its run continues in the same assistant message. */
  | { type: "run_resume" }
  | { type: "text"; delta: string }
  | { type: "tool_start"; tool: ToolPart }
  | {
      type: "tool_end";
      id: string;
      status: "done" | "error";
      output?: string;
      image?: ToolImage;
    }
  | { type: "usage"; turn: TokenUsage; context?: ContextUsage }
  | { type: "done" }
  | { type: "error"; message: string };

/** The question the agent is waiting on, if the transcript ends in one; answer it to continue the thread. */
export function pendingQuestion(messages: readonly ChatMessage[]): ToolPart | undefined {
  const part = messages.at(-1)?.parts.at(-1);
  if (part?.type !== "tool") return undefined;
  const { tool } = part;
  return tool.name === QUESTION_TOOL_NAME && tool.questions && tool.status === "running"
    ? tool
    : undefined;
}

/** What the user answered, read from the finished question tool's output; empty if it has none. */
export function questionAnswers(tool: ToolPart): QuestionAnswer[] {
  if (tool.status !== "done" || !tool.output) return [];
  try {
    const parsed: unknown = JSON.parse(tool.output);
    const answers = (parsed as { answers?: unknown } | null)?.answers;
    return Array.isArray(answers)
      ? answers.filter(
          (answer): answer is QuestionAnswer =>
            typeof answer?.questionId === "string" && typeof answer?.value === "string",
        )
      : [];
  } catch {
    return [];
  }
}

/** The id of the message at `index` in a transcript; the reducer and stored-message rebuilds agree on it. */
export function messageId(index: number) {
  return `m-${index}`;
}

export function isRunning(previous: boolean, event: RunEvent) {
  switch (event.type) {
    case "snapshot":
      return event.running;
    case "run_start":
    case "run_resume":
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
        // Some models open each step with blank text before a tool call; as a part of its own it
        // would split the tool calls around it into separate rows.
        if (event.delta.trim() === "") return parts;
        return [...parts, { type: "text", text: event.delta }];
      });
    case "tool_start":
      return updateLastAssistant(messages, (parts) => [
        ...parts,
        { type: "tool", tool: event.tool },
      ]);
    case "tool_end":
      return updateLastAssistant(messages, (parts) =>
        parts.map((part) => {
          if (part.type !== "tool" || part.tool.id !== event.id) return part;
          const tool: ToolPart = { ...part.tool, status: event.status, output: event.output };
          if (event.image) tool.image = event.image;
          return { type: "tool", tool };
        }),
      );
    default:
      // `done` and `error` do not change the transcript; clients show an error as it arrives
      // (see isRunning) and every client's reducer must agree, per fixtures/reducer.json.
      return messages;
  }
}
