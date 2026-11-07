import { atom } from "jotai";

import type { Provider } from "../types";

export const providersAtom = atom<Provider[] | null>(null);
