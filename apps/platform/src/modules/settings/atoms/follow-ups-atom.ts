import { atom, getDefaultStore } from "jotai";

import { registerUserState } from "@/lib/user-state";

import type { FollowUpSettings } from "../types";

export const followUpsAtom = atom<FollowUpSettings | null>(null);

registerUserState(() => getDefaultStore().set(followUpsAtom, null));
