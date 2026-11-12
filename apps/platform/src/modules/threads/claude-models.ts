export const CLAUDE_MODELS = [
  { id: "default", label: "Default" },
  { id: "sonnet", label: "Sonnet" },
  { id: "opus", label: "Opus" },
  { id: "fable", label: "Fable" },
] as const;

export const CLAUDE_GROUP = "Claude subscription · Agent SDK";

export function claudeModelLabel(modelId: string | undefined) {
  return CLAUDE_MODELS.find((model) => model.id === (modelId ?? "default"))?.label ?? modelId;
}
