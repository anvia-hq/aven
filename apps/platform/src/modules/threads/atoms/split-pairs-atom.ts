import { getDefaultStore } from "jotai";
import { atomWithStorage, RESET } from "jotai/utils";

import { registerUserState } from "@/lib/user-state";

import type { SplitPair } from "../types";

export const splitPairsAtom = atomWithStorage<SplitPair[]>("aven.split-pairs", []);

registerUserState(() => getDefaultStore().set(splitPairsAtom, RESET));
