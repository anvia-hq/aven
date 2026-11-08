import { getDefaultStore } from "jotai";
import { atomWithStorage, RESET } from "jotai/utils";

import { registerUserState } from "@/lib/user-state";

import type { SavedSelection } from "../types";

export const modelSelectionAtom = atomWithStorage<SavedSelection | null>(
  "aven.model-selection",
  null,
);

export const threadModelSelectionsAtom = atomWithStorage<Record<string, SavedSelection>>(
  "aven.model-selection.threads",
  {},
);

function forgetModelSelections() {
  const store = getDefaultStore();
  store.set(modelSelectionAtom, RESET);
  store.set(threadModelSelectionsAtom, RESET);
}

registerUserState(forgetModelSelections);
