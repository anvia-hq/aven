export const PROVIDERS = [
  "openai",
  "anthropic",
  "gemini",
  "bedrock",
  "vertex",
  "azure",
  "openai-compatible",
] as const;
export const DIFF_SCOPES = ["turn", "all", "unshipped"] as const;

export const AGENT_BACKENDS = ["native", "claude"] as const;

export const AGENT_BACKEND_CAPABILITIES = {
  native: {
    question: true,
    restart: true,
    steering: true,
    goals: true,
    compaction: true,
  },
  claude: {
    question: true,
    restart: true,
    steering: true,
    goals: true,
    compaction: true,
  },
} as const satisfies Record<
  (typeof AGENT_BACKENDS)[number],
  Readonly<Record<AgentBackendCapability, boolean>>
>;

export type AgentBackendCapability = "question" | "restart" | "steering" | "goals" | "compaction";

export type AgentBackendCapabilities = Readonly<Record<AgentBackendCapability, boolean>>;

const BACKEND_ACT: Record<AgentBackendCapability, string> = {
  question: "pause for a question",
  restart: "continue a run after the runner restarts",
  steering: "take a message while it is working",
  goals: "run a goal",
  compaction: "compact a thread",
};

export function backendSupports(
  kind: string | null | undefined,
  capability: AgentBackendCapability,
) {
  const name = kind === "claude" ? "claude" : "native";
  return AGENT_BACKEND_CAPABILITIES[name][capability];
}

export function backendRefusal(kind: string, capability: AgentBackendCapability) {
  let name = `The ${kind} agent`;

  if (kind === "claude") name = "The Claude agent";

  if (kind === "native") name = "The native agent";

  return `${name} does not ${BACKEND_ACT[capability]}`;
}

export const CLAUDE_TOKEN_MISSING =
  "Set a Claude setup token in Settings before this thread can run on the Claude agent";

export const RUNTIME_PROVIDERS = ["manual"] as const;

export const RUNTIME_LIFETIMES = ["persistent", "ephemeral"] as const;

export const RUNTIME_GITHUB_MODES = ["machine", "person"] as const;

export const MACHINE_OPS = [
  "prepare",
  "workspace",
  "paths",
  "release",
  "putAway",
  "setProjectEnv",
  "exec",
  "exec.abort",
  "readFile",
  "readTextFilePage",
  "writeFile",
  "listFiles",
  "startProcess",
  "listProcesses",
  "readProcessLogs",
  "stopProcess",
  "uploads.save",
  "artifacts.keep",
  "artifacts.save",
  "skills.install",
  "git.fetch",
  "turn.mark",
  "fork.take",
  "mcp.connect",
  "mcp.call",
  "mcp.close",
] as const;
export const ARTIFACT_MEDIA_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
  "text/html",
  "application/pdf",
  "text/markdown",
  "text/csv",
  "text/plain",
] as const;

export const ARTIFACT_EXTENSIONS: Record<(typeof ARTIFACT_MEDIA_TYPES)[number], string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "text/html": "html",
  "application/pdf": "pdf",
  "text/markdown": "md",
  "text/csv": "csv",
  "text/plain": "txt",
};

export const ARTIFACT_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|gif|webp|mp4|webm|html|pdf|md|csv|txt)$/;

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export const FILE_SEARCH_LIMIT = 50;

export const SKILL_DIGEST = /^[0-9a-f]{64}$/;

export const CloseCode = {
  UnsupportedVersion: 4000,
  Replaced: 4001,
  Revoked: 4002,
} as const;

export const WIRE_VERSION = 59;
