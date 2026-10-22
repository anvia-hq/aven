export type Mode = "smart" | "rush";

export type ToolName = "read" | "edit" | "bash" | "search";

export type DiffLine = {
  type: "add" | "del" | "ctx";
  text: string;
};

export type ToolCall = {
  id: string;
  name: ToolName;
  target: string;
  status: "running" | "done" | "error";
  diff?: DiffLine[];
  output?: string;
};

export type MessagePart = { type: "text"; text: string } | { type: "tool"; tool: ToolCall };

export type ReplyStep =
  | { type: "text"; text: string }
  | { type: "tool"; tool: ToolCall; result: Partial<ToolCall> };

export type Message = {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
  createdAt: string;
};

export type Thread = {
  id: string;
  projectId: string;
  state: "open" | "snoozed" | "archived";
  title: string;
  repo: string;
  branch: string;
  mode: Mode;
  status: "idle" | "running";
  contextUsed: number;
  updatedAt: string;
  messages: Message[];
};

export const MODES: { value: Mode; label: string; description: string }[] = [
  { value: "smart", label: "Smart", description: "Best quality, unconstrained" },
  { value: "rush", label: "Rush", description: "Faster and cheaper for small tasks" },
];

export const SUGGESTIONS = [
  "Add rate limiting to the control-plane API",
  "Write e2e tests for the register flow",
  "Explain how Better Auth sessions work here",
  "Refactor the dashboard stats into a hook",
];
