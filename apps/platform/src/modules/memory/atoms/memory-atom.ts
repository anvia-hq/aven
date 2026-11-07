import { atom } from "jotai";

import type { MemoryNote } from "../types";

export const memoryNotesAtom = atom<MemoryNote[] | null>(null);
