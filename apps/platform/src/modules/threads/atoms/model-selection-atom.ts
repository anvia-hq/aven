import { atomWithStorage } from "jotai/utils";

export type SavedSelection = { providerId: string; modelId?: string; effort?: string };

// The last provider, model and effort picked in any composer: what a new thread starts with, and
// what a thread with no choice of its own uses. It is only a preference: the hook checks it against
// the user's current providers, so a stale or foreign id is ignored.
export const modelSelectionAtom = atomWithStorage<SavedSelection | null>(
  "aven.model-selection",
  null,
);

// Each thread's own choice, by thread id, most recently used last.
export const threadModelSelectionsAtom = atomWithStorage<Record<string, SavedSelection>>(
  "aven.model-selection.threads",
  {},
);
