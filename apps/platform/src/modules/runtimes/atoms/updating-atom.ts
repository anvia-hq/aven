import { atomWithStorage } from "jotai/utils";

export const updatingAtom = atomWithStorage<Record<string, { from: string | null; at: number }>>(
  "aven.runtimes.updating",
  {},
);
