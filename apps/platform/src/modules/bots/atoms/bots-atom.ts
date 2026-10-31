import { atom } from "jotai";

import type { Bot } from "../types";

// The signed-in user's bots as last fetched from the API. Null until the first load.
export const botsAtom = atom<Bot[] | null>(null);
