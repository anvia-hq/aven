import { getDefaultStore, useAtomValue } from "jotai";

import { useModelChoices } from "@/modules/providers/hooks/use-model-choices";
import type { ModelChoice } from "@/modules/providers/types";

import { modelSelectionAtom, threadModelSelectionsAtom } from "../atoms/model-selection-atom";
import type { RunSelection, SavedSelection } from "../types";

const MAX_THREADS = 200;

function withThread(
  all: Record<string, SavedSelection>,
  threadId: string,
  selection: SavedSelection,
) {
  const next = { ...all };
  delete next[threadId];
  next[threadId] = selection;
  const ids = Object.keys(next);
  for (const id of ids.slice(0, Math.max(0, ids.length - MAX_THREADS))) delete next[id];
  return next;
}

function save(threadId: string | undefined, selection: SavedSelection) {
  const store = getDefaultStore();
  store.set(modelSelectionAtom, selection);
  if (threadId) store.set(threadModelSelectionsAtom, (all) => withThread(all, threadId, selection));
}

export function resetModelSelection() {
  const store = getDefaultStore();
  store.set(modelSelectionAtom, null);
  store.set(threadModelSelectionsAtom, {});
}

export function rememberModelSelection(threadId: string, selection: RunSelection) {
  if (!selection.providerId) return;
  save(threadId, {
    providerId: selection.providerId,
    modelId: selection.modelId,
    effort: selection.reasoningEffort,
  });
}

export function useModelSelection(threadId?: string) {
  const { providers, loaded, byProvider, choices, loading } = useModelChoices();
  const last = useAtomValue(modelSelectionAtom);
  const threads = useAtomValue(threadModelSelectionsAtom);
  const saved = (threadId ? threads[threadId] : undefined) ?? last;
  const setSaved = (selection: SavedSelection) => save(threadId, selection);

  const provider =
    providers.find((item) => item.id === saved?.providerId) ??
    providers.find((item) => item.isDefault) ??
    providers[0];
  const own = saved?.providerId === provider?.id ? saved : null;

  const modelId = own?.modelId ?? provider?.modelId ?? null;
  const control = modelId && provider ? byProvider[provider.id]?.efforts[modelId] : undefined;
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
    choices,
    loadingModels: loading,
    levels,
    effort,
    selection,
    selectModel: (choice: ModelChoice) =>
      setSaved({ providerId: choice.provider.id, modelId: choice.modelId }),
    selectEffort: (next: string) =>
      provider &&
      setSaved({ providerId: provider.id, modelId: modelId ?? undefined, effort: next }),
  };
}
