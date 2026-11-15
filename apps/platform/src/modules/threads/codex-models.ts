import { CODEX_MODELS, codexNameOf } from "@aven/protocol/codex-models";

export const CODEX_GROUP = "Codex · API key";

export const CODEX_ITEMS = CODEX_MODELS.map((model) => ({
  id: model.id,
  label: model.isDefault ? `Default · ${model.family}` : model.family,
}));

export function codexTriggerLabel(modelId: string | undefined) {
  return `Codex ${codexNameOf(modelId)}`;
}
