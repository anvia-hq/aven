import { getDefaultStore, useAtomValue } from "jotai";

import { useProviderModels } from "@/modules/settings/hooks/use-provider-models";
import { useProviders } from "@/modules/settings/hooks/use-providers";

import {
  modelSelectionAtom,
  threadModelSelectionsAtom,
  type SavedSelection,
} from "../atoms/model-selection-atom";
import type { RunSelection } from "../types";

// Threads whose choice is remembered; past this, the least recently used are forgotten.
const MAX_THREADS = 200;

function withThread(
  all: Record<string, SavedSelection>,
  threadId: string,
  selection: SavedSelection,
) {
  const next = { ...all };
  // Removed first, so it moves to the end as the most recently used.
  delete next[threadId];
  next[threadId] = selection;
  const ids = Object.keys(next);
  for (const id of ids.slice(0, Math.max(0, ids.length - MAX_THREADS))) delete next[id];
  return next;
}

// A choice is the thread's own, and also what the next new thread starts with.
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

// Keeps a thread on what its message was sent with, so a choice made in another thread never moves
// it. Called when a thread is started and when a message is sent in one.
export function rememberModelSelection(threadId: string, selection: RunSelection) {
  if (!selection.providerId) return;
  save(threadId, {
    providerId: selection.providerId,
    modelId: selection.modelId,
    effort: selection.reasoningEffort,
  });
}

// The composer's provider, model and reasoning effort, for a thread (`threadId`) or for a new one.
// A thread uses its own choice, else the last one made anywhere. The provider is the saved one if
// it still exists, else the user's default. Effort levels belong to the model, so they come from
// its listing and reset to the model's own default whenever the model changes.
export function useModelSelection(threadId?: string) {
  const { providers, loaded } = useProviders();
  const last = useAtomValue(modelSelectionAtom);
  const threads = useAtomValue(threadModelSelectionsAtom);
  const saved = (threadId ? threads[threadId] : undefined) ?? last;
  const setSaved = (selection: SavedSelection) => save(threadId, selection);

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
