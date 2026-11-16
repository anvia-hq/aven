import {
  CLAUDE_DEFAULT_EFFORT,
  CLAUDE_EFFORTS,
  CLAUDE_MODELS,
  claudeVersionOf,
} from "@aven/protocol/claude-models";
import {
  CODEX_DEFAULT_EFFORT,
  CODEX_EFFORTS,
  CODEX_MODELS,
  codexNameOf,
} from "@aven/protocol/codex-models";
import { isSubscriptionProvider } from "@aven/protocol/providers";

import type { ProviderCatalog } from "./types";
import type { Provider } from "@aven/protocol/types";

const evenly = (
  models: readonly { id: string }[],
  options: readonly string[],
  defaultValue: string,
) => Object.fromEntries(models.map((model) => [model.id, { options: [...options], defaultValue }]));

const claudeCatalog = (): ProviderCatalog => ({
  models: CLAUDE_MODELS.map(({ id }) => id),
  labels: Object.fromEntries(
    CLAUDE_MODELS.map((model) => [
      model.id,
      `${model.isDefault ? "Default · " : ""}${model.family} ${claudeVersionOf(model.resolved)}`,
    ]),
  ),
  efforts: evenly(CLAUDE_MODELS, CLAUDE_EFFORTS, CLAUDE_DEFAULT_EFFORT),
});

const codexCatalog = (): ProviderCatalog => ({
  models: CODEX_MODELS.map(({ id }) => id),
  labels: Object.fromEntries(
    CODEX_MODELS.map((model) => [
      model.id,
      `${model.isDefault ? "Default · " : ""}${codexNameOf(model.id)}`,
    ]),
  ),
  efforts: evenly(CODEX_MODELS, CODEX_EFFORTS, CODEX_DEFAULT_EFFORT),
});

export function subscriptionCatalog(kind: Provider): ProviderCatalog | undefined {
  if (!isSubscriptionProvider(kind)) return undefined;

  return kind === "claude-subscription" ? claudeCatalog() : codexCatalog();
}
