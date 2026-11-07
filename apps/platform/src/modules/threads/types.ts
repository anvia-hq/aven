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
import type { useThreadPanels } from "./hooks/use-thread-panels";

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

export type SavedSelection = { providerId: string; modelId?: string; effort?: string };

export type Draft = { choice: string; custom: string };

export type ToolGroupEntry = { type: "tool"; tool: ToolPart } | { type: "reasoning"; text: string };

export type NestedThread = { thread: Thread; nested: boolean };

export type PendingFile = { id: string; file: File; preview?: string };

export type ShipGate =
  | { kind: "checking" }
  | { kind: "ready" }
  | { kind: "unknown" }
  | { kind: "missing"; commands: string[] };

export type ThreadPanels = ReturnType<typeof useThreadPanels>;

export type Mentionable = Pick<MessageMention, "type" | "name">;

export type PendingMessage = { id: string; message: ChatMessage };
