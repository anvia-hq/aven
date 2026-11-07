import { atomWithStorage } from "jotai/utils";

export type SavedSelection = { providerId: string; modelId?: string; effort?: string };

export const modelSelectionAtom = atomWithStorage<SavedSelection | null>(
  "aven.model-selection",
  null,
);

export const threadModelSelectionsAtom = atomWithStorage<Record<string, SavedSelection>>(
  "aven.model-selection.threads",
  {},
);
