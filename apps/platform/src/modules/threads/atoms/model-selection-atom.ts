import { atomWithStorage } from "jotai/utils";

type SavedSelection = { providerId: string; modelId?: string; effort?: string };

// The last provider, model and effort picked in the composer. It is only a preference: the hook
// checks it against the user's current providers, so a stale or foreign id is ignored.
export const modelSelectionAtom = atomWithStorage<SavedSelection | null>(
  "aven.model-selection",
  null,
);
