import { useSetAtom } from "jotai";
import { useState } from "react";

import { toast } from "@/components/toast";
import { api, attempt } from "@/lib/api";

import { providerModelsAtom } from "../atoms/provider-models-atom";
import type { Provider, ProviderModels } from "../types";

export function useRefetchModels() {
  const setCache = useSetAtom(providerModelsAtom);
  const [fetching, setFetching] = useState<string | null>(null);

  async function refetch(provider: Provider) {
    setFetching(provider.id);
    const result = await attempt(`Could not list the models of ${provider.name}`, () =>
      api<ProviderModels>(`/providers/${provider.id}/models`),
    );
    setFetching(null);
    if (!result) return;
    setCache((all) => ({ ...all, [provider.id]: result }));
    const count = result.models.length;
    toast.add({
      title: "Models updated",
      description: `${provider.name}: ${count} ${count === 1 ? "model" : "models"}`,
      type: "success",
    });
  }

  return { refetch, fetching };
}
