import { atom } from "jotai";

import type { ProviderModels } from "../types";

export const providerModelsAtom = atom<Record<string, ProviderModels>>({});
