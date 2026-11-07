import { atomWithStorage } from "jotai/utils";
import type { SavedSelection } from "../types";

export const modelSelectionAtom = atomWithStorage<SavedSelection | null>(
  "aven.model-selection",
  null,
);

export const threadModelSelectionsAtom = atomWithStorage<Record<string, SavedSelection>>(
  "aven.model-selection.threads",
  {},
);
