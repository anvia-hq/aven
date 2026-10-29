import { useAtom } from "jotai";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";

import { providerModelsAtom } from "../atoms/provider-models-atom";
import type { ProviderModels } from "../types";

// The models a saved provider offers. Loads once per provider; `models` stays null while loading
// and after a failure (bad key, server down), when the caller falls back to the configured model.
export function useProviderModels(providerId: string | undefined) {
  const [cache, setCache] = useAtom(providerModelsAtom);
  const [failedId, setFailedId] = useState<string | null>(null);
  const cached = providerId ? cache[providerId] : undefined;

  useEffect(() => {
    if (!providerId || cached) return;
    let current = true;
    api<ProviderModels>(`/providers/${providerId}/models`).then(
      (result) => {
        if (current) setCache((all) => ({ ...all, [providerId]: result }));
      },
      () => {
        if (current) setFailedId(providerId);
      },
    );
    return () => {
      current = false;
    };
  }, [providerId, cached, setCache]);

  return {
    models: cached?.models ?? null,
    efforts: cached?.efforts ?? {},
    loading: Boolean(providerId) && !cached && failedId !== providerId,
  };
}
