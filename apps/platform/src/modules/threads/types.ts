import type {
  ChatMessage,
  DiffLine,
  MessageAttachment,
  MessageMention,
  MessagePart,
  QueuedSteer,
  QuestionAnswer,
  QuestionPrompt,
  SubagentPart,
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
  QueuedSteer,
  QuestionAnswer,
  QuestionPrompt,
  SubagentPart,
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

export type ThreadPullRequest = {
  number: number;
  url: string;
  /** The head branch. */
  branch: string;
  title: string;
  /** As of the end of the thread's last run: GitHub does not tell Aven of a merge. */
  state: "open" | "closed" | "merged";
};

type ThreadState = "open" | "snoozed" | "archived";

/** Who may see a thread: only its creator, or every member of the workspace, to read (decision 0084). */
export type ThreadVisibility = "private" | "workspace";

export type Thread = {
  id: string;
  projectId: string;
  title: string;
  /** The person who made it: the only one who can drive it. */
  createdBy: string;
  createdByName: string;
  visibility: ThreadVisibility;
  /** The runner that hosts the thread's sandbox, copied from its project when the thread was made. */
  runtimeId: string;
  state: ThreadState;
  running: boolean;
  /** The pull requests the agent opened for the thread, newest first (decision 0069); empty until one is found. */
  pullRequests: ThreadPullRequest[];
  createdAt: string;
  updatedAt: string;
};
