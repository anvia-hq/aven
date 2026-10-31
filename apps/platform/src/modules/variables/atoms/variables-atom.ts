import { atom } from "jotai";

import type { Variable } from "../types";

// The variables of each project as last fetched, by project id. A project with no entry has not
// been loaded yet.
export const variablesAtom = atom<Record<string, Variable[]>>({});
