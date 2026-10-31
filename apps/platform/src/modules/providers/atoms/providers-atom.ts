import { atom } from "jotai";

import type { Provider } from "../types";

// The signed-in user's providers as last fetched from the API. Null until the first load.
export const providersAtom = atom<Provider[] | null>(null);
