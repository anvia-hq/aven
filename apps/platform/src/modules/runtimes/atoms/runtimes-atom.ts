import { atom } from "jotai";

import type { Runtime } from "../types";

export const runtimesAtom = atom<Runtime[] | null>(null);
