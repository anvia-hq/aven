import { atom } from "jotai";

import type { MemoryNote } from "../types";

// The signed-in user's memory notes, in every scope, as last fetched. Null until the first load.
export const memoryNotesAtom = atom<MemoryNote[] | null>(null);
