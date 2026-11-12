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

export const AGENT_BACKENDS = ["native", "codex"] as const;

export const RUNTIME_PROVIDERS = ["manual"] as const;

export const RUNTIME_LIFETIMES = ["persistent", "ephemeral"] as const;

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
] as const;

export const ARTIFACT_EXTENSIONS: Record<(typeof ARTIFACT_MEDIA_TYPES)[number], string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "text/html": "html",
};

export const ARTIFACT_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|gif|webp|mp4|webm|html)$/;

export const FILE_SEARCH_LIMIT = 50;

export const SKILL_DIGEST = /^[0-9a-f]{64}$/;

export const CloseCode = {
  UnsupportedVersion: 4000,
  Replaced: 4001,
  Revoked: 4002,
} as const;

export const WIRE_VERSION = 56;
