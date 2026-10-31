import type { ModelChoice } from "../types";
import { useProvidersModels } from "./use-provider-models";
import { useProviders } from "./use-providers";

// Every model the person can pick, across their providers: each provider's configured model first,
// then whatever it lists. `byProvider` is what each provider listed, with its models' efforts.
export function useModelChoices() {
  const { providers, loaded } = useProviders();
  const { byProvider, loading } = useProvidersModels(providers.map((item) => item.id));

  const choices: ModelChoice[] = providers.flatMap((item) => {
    const listed = byProvider[item.id]?.models ?? [];
    return [...new Set([item.modelId, ...listed])]
      .filter((id): id is string => Boolean(id))
      .map((id) => ({ provider: item, modelId: id }));
  });

  return { providers, loaded, byProvider, choices, loading };
}
