import type {
  ChatMessage,
  DiffLine,
  MessagePart,
  QuestionAnswer,
  QuestionPrompt,
  ToolImage,
  ToolPart,
} from "@aven/protocol/events";

// The transcript types are the wire protocol, shared with the control-plane.
export type {
  ChatMessage,
  DiffLine,
  MessagePart,
  QuestionAnswer,
  QuestionPrompt,
  ToolImage,
  ToolPart,
};

/** What a message asks to run with; omitted fields fall back to the sender's default provider. */
export type RunSelection = { providerId?: string; modelId?: string; reasoningEffort?: string };

export type ThreadState = "open" | "snoozed" | "archived";

export type Thread = {
  id: string;
  projectId: string;
  title: string;
  /** The runner that hosts the thread's sandbox, copied from its project when the thread was made. */
  runtimeId: string;
  state: ThreadState;
  running: boolean;
  createdAt: string;
  updatedAt: string;
};
