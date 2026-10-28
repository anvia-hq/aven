import { atom } from "jotai";

import type { Thread } from "../types";

// The organization's threads as last fetched from the API. Null until the first load.
export const threadsAtom = atom<Thread[] | null>(null);
