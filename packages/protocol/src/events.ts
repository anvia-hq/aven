import type {
  ChatMessage,
  ContextUsage,
  MessageMention,
  MessagePart,
  PlanLimit,
  QuestionAnswer,
  RunEvent,
  SubagentEvent,
  SubagentPart,
  ThreadUsage,
  TokenUsage,
  ToolPart,
} from "./types";

export const QUESTION_TOOL_NAME = "ask_user";

export const SECRET_TOOL_NAME = "request_secret";

export const OPEN_BROWSER_TOOL_NAME = "open_browser";

export const SHOW_ARTIFACT_TOOL_NAME = "show_artifact";

export const SHOW_IMAGE_TOOL_NAME = "show_image";

export const VIEW_IMAGE_TOOL_NAME = "view_image";

export const MAX_ARTIFACTS_PER_CALL = 12;

export const SPAWN_AGENT_TOOL_NAME = "spawn_agent";

export const SUBAGENT_TOOLS_KEPT = 50;

export const TOOL_DID_NOT_RUN = "The call did not run: it ended without a result.";

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
    limits: usage?.limits,
  };
}

export function mergeLimits(
  current: readonly PlanLimit[] | undefined,
  incoming: readonly PlanLimit[],
): PlanLimit[] {
  const windows = new Set(incoming.map((limit) => limit.window));
  return [...(current ?? []).filter((limit) => !windows.has(limit.window)), ...incoming];
}

export function applyLimits(usage: ThreadUsage | null, limits: readonly PlanLimit[]): ThreadUsage {
  return {
    totals: usage?.totals ?? NO_USAGE,
    context: usage?.context,
    limits: mergeLimits(usage?.limits, limits),
  };
}

export const ATTACHMENT_LIMITS = {
  count: 10,
  totalBytes: 10 * 1024 * 1024,
  imageBytes: 5 * 1024 * 1024,
} as const;

export const MENTION_LIMIT = 20;

export const mentionToken = ({ type, name }: Pick<MessageMention, "type" | "name">) =>
  `${type === "file" ? "@" : "/"}${name}`;

export function pendingQuestion(messages: readonly ChatMessage[]): ToolPart | undefined {
  const part = messages.at(-1)?.parts.at(-1);

  if (part?.type !== "tool") return undefined;

  const { tool } = part;
  const asks = tool.name === QUESTION_TOOL_NAME || tool.name === SECRET_TOOL_NAME;
  return asks && tool.questions && tool.status === "running" ? tool : undefined;
}

export function answerableQuestion(
  messages: readonly ChatMessage[],
  running: boolean,
  failed: boolean,
): ToolPart | undefined {
  return running || failed ? undefined : pendingQuestion(messages);
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

function endedTool(tool: ToolPart, status: "done" | "error", output?: string): ToolPart {
  const ended: ToolPart = { ...tool, status, output };

  if (ended.subagents)
    ended.subagents = ended.subagents.map((subagent) =>
      subagent.status === "running" ? { ...subagent, status } : subagent,
    );

  return ended;
}

function endRunningTools(messages: ChatMessage[]): ChatMessage[] {
  const ended = messages.map((message) => {
    if (message.role !== "assistant") return message;

    const parts = message.parts.map((part) =>
      part.type === "tool" && part.tool.status === "running" && !part.tool.questions
        ? { type: "tool" as const, tool: endedTool(part.tool, "error", TOOL_DID_NOT_RUN) }
        : part,
    );

    return parts.some((part, at) => part !== message.parts[at]) ? { ...message, parts } : message;
  });

  return ended.some((message, at) => message !== messages[at]) ? ended : messages;
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
      return [...event.messages];
    case "run_start":
    case "steer": {
      const user: ChatMessage = {
        id: messageId(messages.length),
        role: "user",
        parts: [{ type: "text", text: event.prompt }],
      };

      if (event.attachments?.length) user.attachments = event.attachments;

      if (event.mentions?.length) user.mentions = event.mentions;

      if (event.senderId) user.senderId = event.senderId;

      return [
        ...messages,
        user,
        { id: messageId(messages.length + 1), role: "assistant", parts: [] },
      ];
    }
    case "text":
    case "reasoning": {
      const kind = event.type;
      return updateLastAssistant(messages, (parts) => {
        const last = parts.at(-1);

        if (last?.type === kind) {
          return [...parts.slice(0, -1), { type: kind, text: last.text + event.delta }];
        }

        if (event.delta.trim() === "") return parts;

        return [...parts, { type: kind, text: event.delta }];
      });
    }
    case "tool_start":
      return updateLastAssistant(messages, (parts) => [
        ...parts,
        { type: "tool", tool: event.tool },
      ]);
    case "tool_end":
      return updateLastAssistant(messages, (parts) =>
        parts.map((part) => {
          if (part.type !== "tool" || part.tool.id !== event.id) return part;

          const tool = endedTool(part.tool, event.status, event.output);

          if (event.artifacts) tool.artifacts = event.artifacts;

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
    case "done": {
      const closed = endRunningTools(messages);
      const { workedMs } = event;

      if (workedMs === undefined) return closed;

      const index = closed.findLastIndex((message) => message.role === "assistant");

      if (index === -1) return closed;

      return closed.map((message, at) =>
        at === index ? { ...message, workedMs: (message.workedMs ?? 0) + workedMs } : message,
      );
    }
    case "error":
      return endRunningTools(messages);
    case "run_resume":
    case "steer_queued":
    case "steer_applied":
    case "steer_rejected":
    case "narration":
    case "usage":
    case "limits":
      return messages;
    default:
      event satisfies never;
      return messages;
  }
}

export function withWorkedTimes(
  messages: ChatMessage[],
  times: ReadonlyMap<number, number>,
): ChatMessage[] {
  return messages.map((message, at) => {
    const workedMs = times.get(at);
    return workedMs === undefined ? message : { ...message, workedMs };
  });
}

export function withSenders(
  messages: ChatMessage[],
  senders: ReadonlyMap<number, string>,
): ChatMessage[] {
  return messages.map((message, at) => {
    const senderId = senders.get(at);
    return senderId === undefined ? message : { ...message, senderId };
  });
}
