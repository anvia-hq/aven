import type { ChatMessage, DiffLine, MessagePart, ToolPart } from "@aven/agents/protocol";

// The transcript types are the wire protocol, shared with the control-plane.
export type { ChatMessage, DiffLine, MessagePart, ToolPart };

export type Mode = "smart" | "rush";

export type ThreadState = "open" | "snoozed" | "archived";

export type Thread = {
  id: string;
  projectId: string;
  title: string;
  /** Directory on the machine running control-plane that the agent works in. */
  projectPath: string;
  state: ThreadState;
  running: boolean;
  createdAt: string;
  updatedAt: string;
};

export const MODES: { value: Mode; label: string; description: string }[] = [
  { value: "smart", label: "Smart", description: "Best quality, unconstrained" },
  { value: "rush", label: "Rush", description: "Faster and cheaper for small tasks" },
];

export const SUGGESTIONS = [
  "Explain how this project is structured",
  "Find and fix any failing tests",
  "Add a README section describing how to run it",
  "Summarize the most recent changes",
];
