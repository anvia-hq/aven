import type { ClaudeEffort } from "./types";

export const CLAUDE_EFFORTS = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const satisfies readonly ClaudeEffort[];

export const CLAUDE_DEFAULT_EFFORT: ClaudeEffort = "medium";

export const CLAUDE_MODELS = [
  { id: "default", family: "Sonnet", resolved: "claude-sonnet-5-5", isDefault: true },
  { id: "sonnet", family: "Sonnet", resolved: "claude-sonnet-5-5", isDefault: false },
  { id: "opus", family: "Opus", resolved: "claude-opus-5-5", isDefault: false },
  { id: "fable", family: "Fable", resolved: "claude-fable-5-2", isDefault: false },
  { id: "haiku", family: "Haiku", resolved: "claude-haiku-5-5", isDefault: false },
] as const;

export function claudeVersionOf(resolved: string) {
  return resolved.split("-").slice(2).join(".");
}

export function claudeNameOf(modelId: string | undefined) {
  const model = CLAUDE_MODELS.find((item) => item.id === (modelId ?? "default"));

  return model ? `${model.family} ${claudeVersionOf(model.resolved)}` : (modelId ?? "");
}

export function isClaudeEffort(value: string | undefined): value is ClaudeEffort {
  return (CLAUDE_EFFORTS as readonly (string | undefined)[]).includes(value);
}

export function claudeEffortOf(value: string | undefined) {
  return isClaudeEffort(value) ? value : undefined;
}
