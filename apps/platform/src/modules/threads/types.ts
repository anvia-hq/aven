import type { useThreadPanels } from "./hooks/use-thread-panels";
import type {
  ChatMessage,
  DiffLine,
  MessageAttachment,
  MessageMention,
  MessagePart,
  QuestionAnswer,
  QuestionPrompt,
  QueuedSteer,
  SubagentPart,
  ToolArtifact,
  ToolPart,
} from "@aven/protocol/types";

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

export type ThreadPerson = { id: string; name: string };

export type ThreadVisibility = "private" | "workspace";

export type Thread = {
  id: string;
  projectId: string;
  title: string;
  createdBy: string;
  createdByName: string;
  participants: ThreadPerson[];
  visibility: ThreadVisibility;
  drivingUntil: string | null;
  parentThreadId: string | null;
  runtimeId: string;
  state: ThreadState;
  running: boolean;
  pullRequests: ThreadPullRequest[];
  createdAt: string;
  updatedAt: string;
};

export type Crowd = { shown: ThreadPerson[]; more: number; names: string[] };

export type Viewer = {
  id: string;
  owned: boolean;
  name: string;
  ownerId: string;
  ownerName: string;
};

export type MessageAuthor = { mine: boolean; name: string; text: string };

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

export type ShipLabel = "Ship" | "Update PR" | "New PR";

export type ShipAct =
  | { kind: "loading" }
  | { kind: "failed"; reason: string }
  | { kind: "set-up"; command: string; skill: string; disabled: boolean }
  | { kind: "connect"; appKey: string | null }
  | { kind: "blocked"; label: ShipLabel }
  | {
      kind: "ship";
      label: ShipLabel;
      disabled: boolean;
      shipping: boolean;
      canOpenNew: boolean;
    }
  | { kind: "open"; disabled: boolean }
  | { kind: "none" };

export type ShipChanges = {
  loaded: boolean;
  available: boolean | null;
  problem: string | null;
  any: boolean;
};

export type ShipBranchPulls = {
  loaded: boolean;
  problem: string | null;
  known: boolean;
  any: boolean;
};

export type ShipFacts = {
  running: boolean;
  shipping: boolean;
  gate: ShipGate;
  appKey: string | null;
  connected: boolean | null;
  changes: ShipChanges;
  branch: ShipChanges;
  branchPulls: ShipBranchPulls;
  pullRequests: ThreadPullRequest[];
};

export type ThreadPanels = ReturnType<typeof useThreadPanels>;

export type Mentionable = Pick<MessageMention, "type" | "name">;

export type PendingMessage = { id: string; message: ChatMessage };

export type ViewerImage = { src: string; label: string };

export type Block =
  | { type: "text"; text: string }
  | { type: "question"; tool: ToolPart }
  | { type: "artifacts"; artifacts: ToolArtifact[] }
  | { type: "subagents"; tool: ToolPart }
  | { type: "tools"; entries: ToolGroupEntry[] };

export type MentionPerson = { id: string; name: string; email: string; image: string | null };

export type SplitSide = "left" | "right";
