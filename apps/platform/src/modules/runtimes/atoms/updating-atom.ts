import { atomWithStorage } from "jotai/utils";

import type { UpdateAsked } from "../updating";

export const updatingAtom = atomWithStorage<Record<string, UpdateAsked>>(
  "aven.runtimes.updating",
  {},
);
