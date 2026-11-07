import { atom } from "jotai";

// The runners an owner or an admin asked to update, by id: the release each was on and when it was
// asked, so the row says Updating until the runner is back on another release (decision 0146).
export const updatingAtom = atom<Record<string, { from: string | null; at: number }>>({});
