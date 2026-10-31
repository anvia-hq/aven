import { atom } from "jotai";

// What each bot said last, by bot id, as its open chat last told. The sidebar shows it.
export const botLastMessagesAtom = atom<Record<string, string>>({});
