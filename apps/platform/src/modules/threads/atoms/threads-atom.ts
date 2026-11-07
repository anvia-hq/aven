import { atom } from "jotai";

import type { Thread } from "../types";

export const threadsAtom = atom<Thread[] | null>(null);
