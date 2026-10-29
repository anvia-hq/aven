import { atom } from "jotai";

import type { Runtime } from "../types";

// The active organization's runtimes as last fetched. Null until the first load.
export const runtimesAtom = atom<Runtime[] | null>(null);
