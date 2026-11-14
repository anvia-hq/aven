import { atom } from "jotai";

import type { Mention } from "../types";

export const mentionsAtom = atom<Mention[] | null>(null);
