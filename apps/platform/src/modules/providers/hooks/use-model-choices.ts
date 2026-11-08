import type { ModelChoice } from "../types";
import { useProvidersModels } from "./use-provider-models";
import { useProviders } from "./use-providers";

export function useModelChoices() {
  const { providers, loaded } = useProviders();
  const { byProvider, loading } = useProvidersModels(providers.map((item) => item.id));

  const choices: ModelChoice[] = providers.flatMap((item) => {
    const listed = byProvider[item.id]?.models ?? [];
    return [...new Set([item.modelId, ...listed])]
      .filter((id): id is string => Boolean(id))
      .map((id) => ({
        provider: item,
        modelId: id,
        label: byProvider[item.id]?.labels?.[id] ?? id,
      }));
  });

  const labelOf = (providerId: string | undefined, modelId: string) =>
    (providerId ? byProvider[providerId]?.labels?.[modelId] : undefined) ?? modelId;

  return { providers, loaded, byProvider, choices, loading, labelOf };
}
