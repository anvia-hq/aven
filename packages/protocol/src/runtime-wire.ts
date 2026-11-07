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
export const ARTIFACT_MEDIA_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
] as const;

export const ARTIFACT_EXTENSIONS: Record<(typeof ARTIFACT_MEDIA_TYPES)[number], string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

export const ARTIFACT_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|gif|webp|mp4|webm)$/;

export const FILE_SEARCH_LIMIT = 50;

export const SKILL_DIGEST = /^[0-9a-f]{64}$/;

export const CloseCode = {
  UnsupportedVersion: 4000,
  Replaced: 4001,
  Revoked: 4002,
} as const;

export const WIRE_VERSION = 49;
