import { useAtom } from "jotai";
import { useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";

import { providerModelsAtom } from "../atoms/provider-models-atom";

export function useProvidersModels(providerIds: string[]) {
  const [cache, setCache] = useAtom(providerModelsAtom);
  const [failed, setFailed] = useState<string[]>([]);
  const asked = useRef(new Set<string>());
  const key = providerIds.join(",");

  useEffect(() => {
    for (const id of key ? key.split(",") : []) {
      if (cache[id] || asked.current.has(id)) continue;

      asked.current.add(id);
      api<(typeof cache)[string]>(`/providers/${id}/models`).then(
        (result) => setCache((all) => ({ ...all, [id]: result })),
        () => setFailed((ids) => [...ids, id]),
      );
    }
  }, [key, cache, setCache]);

  return {
    byProvider: cache,
    loading: providerIds.some((id) => !cache[id] && !failed.includes(id)),
  };
}
