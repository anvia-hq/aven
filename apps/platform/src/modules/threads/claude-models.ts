import { CLAUDE_MODELS, claudeNameOf, claudeVersionOf } from "@aven/protocol/claude-models";

export const CLAUDE_GROUP = "Claude subscription · Agent SDK";

export const CLAUDE_ITEMS = CLAUDE_MODELS.map((model) => ({
  id: model.id,
  label: model.isDefault
    ? `Default · ${model.family} ${claudeVersionOf(model.resolved)}`
    : `${model.family} ${claudeVersionOf(model.resolved)}`,
}));

export function claudeTriggerLabel(modelId: string | undefined) {
  return `Claude ${claudeNameOf(modelId)}`;
}
