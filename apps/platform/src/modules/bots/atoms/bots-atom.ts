import { atom } from "jotai";

import type { Bot } from "../types";

export const botsAtom = atom<Bot[] | null>(null);
