import { getDefaultStore, useAtom } from "jotai";

import { useProviderModels } from "@/modules/settings/hooks/use-provider-models";
import { useProviders } from "@/modules/settings/hooks/use-providers";

import { modelSelectionAtom } from "../atoms/model-selection-atom";
import type { RunSelection } from "../types";

export function clearModelSelection() {
  getDefaultStore().set(modelSelectionAtom, null);
}

// The composer's provider, model and reasoning effort. The provider is the saved one if it still
// exists, else the user's default. Effort levels belong to the model, so they come from its
// listing and reset to the model's own default whenever the model changes.
export function useModelSelection() {
  const { providers, loaded } = useProviders();
  const [saved, setSaved] = useAtom(modelSelectionAtom);

  const provider =
    providers.find((item) => item.id === saved?.providerId) ??
    providers.find((item) => item.isDefault) ??
    providers[0];
  const own = saved?.providerId === provider?.id ? saved : null;
  const { models, efforts, loading } = useProviderModels(provider?.id);

  const modelId = own?.modelId ?? provider?.modelId ?? null;
  // The configured model first, then whatever the provider listed.
  const listed = models ?? [];
  const modelOptions = [...new Set([provider?.modelId, ...listed])].filter((id): id is string =>
    Boolean(id),
  );

  const control = modelId ? efforts[modelId] : undefined;
  const levels = control?.options ?? [];
  const fallback = control?.defaultValue ?? (levels.includes("medium") ? "medium" : levels[0]);
  const effort = own?.effort && levels.includes(own.effort) ? own.effort : fallback;

  const selection: RunSelection = provider
    ? {
        providerId: provider.id,
        modelId: modelId ?? undefined,
        reasoningEffort: levels.length > 0 ? effort : undefined,
      }
    : {};

  return {
    providers,
    loaded,
    provider,
    modelId,
    modelOptions,
    loadingModels: loading,
    levels,
    effort,
    selection,
    selectProvider: (providerId: string) => setSaved({ providerId }),
    selectModel: (next: string) => provider && setSaved({ providerId: provider.id, modelId: next }),
    selectEffort: (next: string) =>
      provider &&
      setSaved({ providerId: provider.id, modelId: modelId ?? undefined, effort: next }),
  };
}
