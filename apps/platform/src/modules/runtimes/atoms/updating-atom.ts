import { atomWithStorage } from "jotai/utils";

import type { UpdateAsked } from "../types";

export const updatingAtom = atomWithStorage<Record<string, UpdateAsked>>(
  "aven.runtimes.updating",
  {},
);
