import { getDefaultStore } from "jotai";
import { atomWithStorage, RESET } from "jotai/utils";

import { registerUserState } from "@/lib/user-state";

import type { DiffScope } from "../types";

export const diffScopeAtom = atomWithStorage<DiffScope>("aven.diff-scope", "turn");

registerUserState(() => getDefaultStore().set(diffScopeAtom, RESET));
