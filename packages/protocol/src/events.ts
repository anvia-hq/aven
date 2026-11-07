export type DiffLine = { type: "add" | "del" | "ctx"; text: string };

type QuestionChoice = { label: string; value: string };

export type QuestionPrompt = {
  id: string;
  text: string;
  choices?: QuestionChoice[];
  allowCustom?: boolean;
};

export type QuestionAnswer = { questionId: string; value: string };

export const QUESTION_TOOL_NAME = "ask_user";

export const SECRET_TOOL_NAME = "request_secret";

export const SHOW_ARTIFACT_TOOL_NAME = "show_artifact";

export const SHOW_IMAGE_TOOL_NAME = "show_image";

export const MAX_ARTIFACTS_PER_CALL = 12;

export const SPAWN_AGENT_TOOL_NAME = "spawn_agent";

export type ToolArtifact = { name: string; mediaType: string; caption?: string };

export type SubagentPart = {
  index: number;
  description: string;
  type: string;
  status: "running" | "done" | "error";
  tools: ToolPart[];
  output?: string;
};

export const SUBAGENT_TOOLS_KEPT = 50;

export type ToolPart = {
  id: string;
  name: string;
  target: string;
  status: "running" | "done" | "error";
  diff?: DiffLine[];
  output?: string;
  questions?: QuestionPrompt[];
  artifacts?: ToolArtifact[];
  subagents?: SubagentPart[];
};

export type SubagentEvent =
  | { type: "tool_start"; tool: Pick<ToolPart, "id" | "name" | "target" | "status"> }
  | { type: "tool_end"; id: string; status: "done" | "error" }
  | { type: "end"; status: "done" | "error"; output?: string };

export type ContextUsage = { usedTokens: number; contextWindow: number };

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
};

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

export function applyUsage(
  usage: ThreadUsage | null,
  event: { turn: TokenUsage; context?: ContextUsage },
): ThreadUsage {
  return {
    totals: addUsage(usage?.totals ?? NO_USAGE, event.turn),
    context: event.context ?? usage?.context,
  };
}

export type MessagePart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool"; tool: ToolPart };

export type MessageAttachment = { name: string; mediaType: string; size: number; image?: string };

export const ATTACHMENT_LIMITS = {
  count: 10,
  totalBytes: 10 * 1024 * 1024,
  imageBytes: 5 * 1024 * 1024,
} as const;

export type MessageMention = { type: "file" | "skill"; name: string; from: number; to: number };

export const MENTION_LIMIT = 20;

export const mentionToken = ({ type, name }: Pick<MessageMention, "type" | "name">) =>
  `${type === "file" ? "@" : "/"}${name}`;

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
  attachments?: MessageAttachment[];
  mentions?: MessageMention[];
};

export type QueuedSteer = { id: string; prompt: string; mentions?: MessageMention[] };

export type RunEvent =
  | {
      type: "snapshot";
      messages: ChatMessage[];
      running: boolean;
      usage?: ThreadUsage;
      runningMs?: number;
      steers?: QueuedSteer[];
      error?: string;
    }
  | {
      type: "run_start";
      prompt: string;
      attachments?: MessageAttachment[];
      mentions?: MessageMention[];
    }
  | { type: "run_resume" }
  | ({ type: "steer_queued" } & QueuedSteer)
  | ({ type: "steer" } & QueuedSteer)
  | { type: "steer_applied"; id: string }
  | { type: "steer_rejected"; id: string; reason?: string }
  | { type: "text"; delta: string }
  | { type: "reasoning"; delta: string }
  | { type: "tool_start"; tool: ToolPart }
  | {
      type: "tool_end";
      id: string;
      status: "done" | "error";
      output?: string;
      artifacts?: ToolArtifact[];
    }
  | { type: "usage"; turn: TokenUsage; context?: ContextUsage }
  | { type: "subagent"; index: number; event: SubagentEvent }
  | { type: "done" }
  | { type: "error"; message: string };

export function pendingQuestion(messages: readonly ChatMessage[]): ToolPart | undefined {
  const part = messages.at(-1)?.parts.at(-1);
  if (part?.type !== "tool") return undefined;
  const { tool } = part;
  const asks = tool.name === QUESTION_TOOL_NAME || tool.name === SECRET_TOOL_NAME;
  return asks && tool.questions && tool.status === "running" ? tool : undefined;
}

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
        if (event.delta.trim() === "") return parts;
        return [...parts, { type: "text", text: event.delta }];
      });
    case "reasoning":
      return updateLastAssistant(messages, (parts) => {
        const last = parts.at(-1);
        if (last?.type === "reasoning") {
          return [...parts.slice(0, -1), { type: "reasoning", text: last.text + event.delta }];
        }
        if (event.delta.trim() === "") return parts;
        return [...parts, { type: "reasoning", text: event.delta }];
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
          if (event.artifacts) tool.artifacts = event.artifacts;
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
      return messages;
  }
}
