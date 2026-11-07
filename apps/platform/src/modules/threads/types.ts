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
  ToolArtifact,
  ToolPart,
} from "@aven/protocol/events";

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
  ToolArtifact,
  ToolPart,
};

export type AttachmentUpload = { name: string; mediaType?: string; data: string };

export type OutgoingMessage = {
  prompt: string;
  attachments: AttachmentUpload[];
  mentions: MessageMention[];
};

export type RunSelection = { providerId?: string; modelId?: string; reasoningEffort?: string };

export type SecretChoice = { secretScope: "project" | "personal"; skipSecrets?: boolean };

export type ThreadPullRequest = {
  number: number;
  url: string;
  branch: string;
  title: string;
  state: "open" | "closed" | "merged";
};

type ThreadState = "open" | "snoozed" | "archived";

export type ThreadVisibility = "private" | "workspace";

export type Thread = {
  id: string;
  projectId: string;
  title: string;
  createdBy: string;
  createdByName: string;
  visibility: ThreadVisibility;
  parentThreadId: string | null;
  runtimeId: string;
  state: ThreadState;
  running: boolean;
  pullRequests: ThreadPullRequest[];
  createdAt: string;
  updatedAt: string;
};
