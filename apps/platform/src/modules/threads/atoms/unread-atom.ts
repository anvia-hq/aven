import { atomWithStorage } from "jotai/utils";

export const unreadAtom = atomWithStorage<string[]>("aven.threads.unread", []);
