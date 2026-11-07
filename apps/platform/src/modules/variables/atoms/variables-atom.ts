import { atom } from "jotai";

import type { Variable } from "../types";

export const variablesAtom = atom<Record<string, Variable[]>>({});
