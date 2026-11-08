import { getDefaultStore } from "jotai";
import { atomWithStorage, RESET } from "jotai/utils";

import { registerUserState } from "@/lib/user-state";

export const unreadAtom = atomWithStorage<string[]>("aven.threads.unread", []);

function forgetUnreadThreads() {
  getDefaultStore().set(unreadAtom, RESET);
}

registerUserState(forgetUnreadThreads);
