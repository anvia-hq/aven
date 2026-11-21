import { atom, getDefaultStore } from "jotai";

import { registerUserState } from "@/lib/user-state";

import type { DiffCacheEntry, ThreadDiffScope } from "../types";

export const threadDiffCacheAtom = atom<Record<string, DiffCacheEntry>>({});

export const diffCacheKey = (threadId: string, scope: ThreadDiffScope, summaryOnly: boolean) =>
  `${threadId}:${scope}:${summaryOnly ? "summary" : "full"}`;

registerUserState(() => getDefaultStore().set(threadDiffCacheAtom, {}));
