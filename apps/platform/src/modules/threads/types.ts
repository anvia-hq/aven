import type {
  ChatMessage,
  DiffLine,
  MessageAttachment,
  MessageMention,
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
  MessageAttachment,
  MessageMention,
  MessagePart,
  QuestionAnswer,
  QuestionPrompt,
  ToolImage,
  ToolPart,
};

/** A file as a message sends it: its bytes in base64 (decision 0034). */
export type AttachmentUpload = { name: string; mediaType?: string; data: string };

/** A message as the composer sends it: the text, its files and what it mentions (decision 0036). */
export type OutgoingMessage = {
  prompt: string;
  attachments: AttachmentUpload[];
  mentions: MessageMention[];
};

/** What a message asks to run with; omitted fields fall back to the sender's default provider. */
export type RunSelection = { providerId?: string; modelId?: string; reasoningEffort?: string };

/** How an answer to a request for a secret is kept (decision 0047): whose variable it becomes, or that it is declined. */
export type SecretChoice = { secretScope: "project" | "personal"; skipSecrets?: boolean };

type ThreadState = "open" | "snoozed" | "archived";

export type Thread = {
  id: string;
  projectId: string;
  title: string;
  /** The runner that hosts the thread's sandbox, copied from its project when the thread was made. */
  runtimeId: string;
  state: ThreadState;
  running: boolean;
  /** The pull request opened for the thread's branch (decision 0044); null until one is found. */
  pullRequestNumber: number | null;
  pullRequestUrl: string | null;
  createdAt: string;
  updatedAt: string;
};
