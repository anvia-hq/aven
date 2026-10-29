import { atom } from "jotai";

import type { ProviderModels } from "../types";

// Each provider's model list as last fetched, by provider id. Fetching asks the provider itself,
// so it is done once per provider and kept until sign-out.
export const providerModelsAtom = atom<Record<string, ProviderModels>>({});
