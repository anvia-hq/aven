import { atom } from "jotai";

import type { Automation } from "../types";

export const automationsAtom = atom<Automation[] | null>(null);
