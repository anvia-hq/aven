// The wire protocol between the control plane and every client (web, macOS, ...) and runtime.
// Types plus a pure reducer, with no runtime imports, so clients can bundle it.

export type DiffLine = { type: "add" | "del" | "ctx"; text: string };

type QuestionChoice = { label: string; value: string };

/** One thing the agent asks the user. With `choices` the user picks one; `allowCustom` also lets them write their own answer. */
export type QuestionPrompt = {
  id: string;
  text: string;
  choices?: QuestionChoice[];
  allowCustom?: boolean;
};

export type QuestionAnswer = { questionId: string; value: string };

export const QUESTION_TOOL_NAME = "ask_user";

/** The agent asks for a secret (decision 0047): a question whose answer is stored, never shown to the agent. */
export const SECRET_TOOL_NAME = "request_secret";

export const SHOW_IMAGE_TOOL_NAME = "show_image";

/** The agent hands tasks to subagents (decision 0057): its result is theirs, in the order asked. */
export const SPAWN_AGENT_TOOL_NAME = "spawn_agent";

/** An image the agent showed the user (decision 0033). `name` is what `GET /threads/:id/artifacts/:name` serves it by. */
export type ToolImage = { name: string; mediaType: string; caption?: string };

/**
 * One subagent of a `spawn_agent` call (decision 0057): a task the agent handed over, by its place
 * in the call. `tools` are what it called, as it works, for the live view; a transcript rebuilt
 * from storage has none, only how it ended.
 */
export type SubagentPart = {
  index: number;
  description: string;
  /** What kind of subagent it is: `explore` or `general`. */
  type: string;
  status: "running" | "done" | "error";
  tools: ToolPart[];
  /** What it sent back (or why it failed), once it has. */
  output?: string;
};

/** How many of a subagent's tool calls a transcript keeps: the latest. */
export const SUBAGENT_TOOLS_KEPT = 50;

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
  /** Set on `spawn_agent`: its tasks, as they go. */
  subagents?: SubagentPart[];
};

/** What a subagent does, told as it happens. A tool call carries no more than what it acts on. */
export type SubagentEvent =
  | { type: "tool_start"; tool: Pick<ToolPart, "id" | "name" | "target" | "status"> }
  | { type: "tool_end"; id: string; status: "done" | "error" }
  | { type: "end"; status: "done" | "error"; output?: string };

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

/**
 * A file the user attached to a message (decision 0034). Every one is copied into the sandbox; an
 * image is also shown to the model, and `image` is the name `GET /threads/:id/artifacts/:name`
 * serves it by.
 */
export type MessageAttachment = { name: string; mediaType: string; size: number; image?: string };

/** How much a message may carry. A model takes images of up to 5 MB. */
export const ATTACHMENT_LIMITS = {
  count: 10,
  totalBytes: 10 * 1024 * 1024,
  imageBytes: 5 * 1024 * 1024,
} as const;

/**
 * A file or a skill the user picked in the composer (decision 0036). Its token in the prompt is
 * `@` and the file's path in the workspace, or `/` and the skill's name, from `from` to `to`.
 */
export type MessageMention = { type: "file" | "skill"; name: string; from: number; to: number };

/** How many mentions a message may carry. */
export const MENTION_LIMIT = 20;

/** The text of a mention's token in the prompt. */
export const mentionToken = ({ type, name }: Pick<MessageMention, "type" | "name">) =>
  `${type === "file" ? "@" : "/"}${name}`;

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
  /** On a user message: the files sent with it. */
  attachments?: MessageAttachment[];
  /** On a user message: the files and skills it mentions. */
  mentions?: MessageMention[];
};

/**
 * A message the person sent while the agent was working, which the agent has not taken yet: it is
 * applied at the agent's next safe step, never in the middle of a model call or a tool (decision 0098).
 */
export type QueuedSteer = { id: string; prompt: string; mentions?: MessageMention[] };

export type RunEvent =
  /** Full transcript, sent when a client connects. Replaces whatever it had. */
  | {
      type: "snapshot";
      messages: ChatMessage[];
      running: boolean;
      usage?: ThreadUsage;
      /** How long the run in progress has gone on, in milliseconds, for a client that attaches part way through it. */
      runningMs?: number;
      /** What the person said during the run that the agent has not taken yet, oldest first. */
      steers?: QueuedSteer[];
    }
  | {
      type: "run_start";
      prompt: string;
      attachments?: MessageAttachment[];
      mentions?: MessageMention[];
    }
  /** The user answered the agent's question and its run continues in the same assistant message. */
  | { type: "run_resume" }
  /** The person said something while the agent works; the runner has it and will apply it at the next safe step (decision 0098). */
  | ({ type: "steer_queued" } & QueuedSteer)
  /** The agent took a queued message: it is the person's next message and the agent's output goes after it. */
  | ({ type: "steer" } & QueuedSteer)
  /**
   * A runner says the agent took the queued message `id`. The control plane, which has its words,
   * turns it into `steer` before any client sees it.
   */
  | { type: "steer_applied"; id: string }
  /** A queued message was not delivered; `reason` is shown to the person, and none means it is sent another way. */
  | { type: "steer_rejected"; id: string; reason?: string }
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
  /**
   * A subagent of the `spawn_agent` call that is running, by its index in the call (decision 0057).
   * An agent runs one tool call at a time, so the call is the latest running one.
   */
  | { type: "subagent"; index: number; event: SubagentEvent }
  | { type: "done" }
  | { type: "error"; message: string };

/** The question the agent is waiting on, if the transcript ends in one; answer it to continue the thread. */
export function pendingQuestion(messages: readonly ChatMessage[]): ToolPart | undefined {
  const part = messages.at(-1)?.parts.at(-1);
  if (part?.type !== "tool") return undefined;
  const { tool } = part;
  const asks = tool.name === QUESTION_TOOL_NAME || tool.name === SECRET_TOOL_NAME;
  return asks && tool.questions && tool.status === "running" ? tool : undefined;
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

function applySubagentEvent(subagent: SubagentPart, event: SubagentEvent): SubagentPart {
  switch (event.type) {
    case "tool_start":
      return {
        ...subagent,
        tools: [...subagent.tools, event.tool].slice(-SUBAGENT_TOOLS_KEPT),
      };
    case "tool_end":
      return {
        ...subagent,
        tools: subagent.tools.map((tool) =>
          tool.id === event.id ? { ...tool, status: event.status } : tool,
        ),
      };
    case "end":
      return { ...subagent, status: event.status, output: event.output };
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
    case "run_start": {
      const user: ChatMessage = {
        id: messageId(messages.length),
        role: "user",
        parts: [{ type: "text", text: event.prompt }],
      };
      if (event.attachments?.length) user.attachments = event.attachments;
      if (event.mentions?.length) user.mentions = event.mentions;
      return [
        ...messages,
        user,
        { id: messageId(messages.length + 1), role: "assistant", parts: [] },
      ];
    }
    case "steer": {
      const user: ChatMessage = {
        id: messageId(messages.length),
        role: "user",
        parts: [{ type: "text", text: event.prompt }],
      };
      if (event.mentions?.length) user.mentions = event.mentions;
      return [
        ...messages,
        user,
        { id: messageId(messages.length + 1), role: "assistant", parts: [] },
      ];
    }
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
          // A subagent still working when its call ends (the call failed) is not working any more.
          if (tool.subagents)
            tool.subagents = tool.subagents.map((subagent) =>
              subagent.status === "running" ? { ...subagent, status: event.status } : subagent,
            );
          return { type: "tool", tool };
        }),
      );
    case "subagent":
      return updateLastAssistant(messages, (parts) => {
        const call = parts.findLastIndex(
          (part) =>
            part.type === "tool" &&
            part.tool.name === SPAWN_AGENT_TOOL_NAME &&
            part.tool.status === "running",
        );
        return parts.map((part, at) => {
          if (at !== call || part.type !== "tool") return part;
          const subagents = part.tool.subagents?.map((subagent) =>
            subagent.index === event.index ? applySubagentEvent(subagent, event.event) : subagent,
          );
          return { type: "tool", tool: { ...part.tool, subagents } };
        });
      });
    default:
      // `done` and `error` do not change the transcript; clients show an error as it arrives
      // (see isRunning) and every client's reducer must agree, per fixtures/reducer.json.
      return messages;
  }
}
