import { atomWithStorage } from "jotai/utils";

// The runners an owner or an admin asked to update, by id: the release each was on and when it was
// asked, so the row says Updating until the runner is back on another release (decision 0146). Kept
// in localStorage, so a refresh does not forget it; the five-minute limit in `isUpdating` ends a
// stale entry.
export const updatingAtom = atomWithStorage<Record<string, { from: string | null; at: number }>>(
  "aven.runtimes.updating",
  {},
);
