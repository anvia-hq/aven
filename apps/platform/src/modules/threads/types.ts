import type { ChatMessage, DiffLine, MessagePart, ToolPart } from "@aven/protocol/events";

// The transcript types are the wire protocol, shared with the control-plane.
export type { ChatMessage, DiffLine, MessagePart, ToolPart };

/** What a message asks to run with; omitted fields fall back to the sender's default provider. */
export type RunSelection = { providerId?: string; modelId?: string; reasoningEffort?: string };

export type ThreadState = "open" | "snoozed" | "archived";

export type Thread = {
  id: string;
  projectId: string;
  title: string;
  /** The runtime that machine is; null means the control plane's own. */
  runtimeId: string;
  state: ThreadState;
  running: boolean;
  createdAt: string;
  updatedAt: string;
};

export const SUGGESTIONS = [
  "Explain how this project is structured",
  "Find and fix any failing tests",
  "Add a README section describing how to run it",
  "Summarize the most recent changes",
];
