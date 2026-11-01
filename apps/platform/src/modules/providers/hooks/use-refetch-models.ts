import { useSetAtom } from "jotai";
import { useState } from "react";

import { toast } from "@/components/toast";
import { api, attempt } from "@/lib/api";

import { providerModelsAtom } from "../atoms/provider-models-atom";
import type { Provider, ProviderModels } from "../types";

// Asks a provider for its models again and replaces what was kept. They are asked once per page
// otherwise, so a model a gateway adds later, or a list that failed on a wrong key that is right
// now, would stay as it was until the page is loaded again.
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
