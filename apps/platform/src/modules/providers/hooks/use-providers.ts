import { getDefaultStore, useAtom } from "jotai";
import { useEffect } from "react";

import { toast } from "@aven/ui/toast";
import { api, attempt, postJson } from "@/lib/api";
import { createListStore } from "@/lib/list-store";

import { providerModelsAtom } from "../atoms/provider-models-atom";
import { providersAtom } from "../atoms/providers-atom";
import type { ListedModels, NewProvider, Provider, ProviderPatch } from "../types";

const providersStore = createListStore<Provider>({
  path: "/providers",
  atom: providersAtom,
  label: "providers",
});

export function resetProviders() {
  providersStore.reset();
  getDefaultStore().set(providerModelsAtom, {});
}

export function refreshProviders() {
  if (getDefaultStore().get(providersAtom) !== null) void providersStore.refresh();
}

export function useProviders() {
  const [providers] = useAtom(providersAtom);
  const { refresh } = providersStore;

  useEffect(() => {
    if (providers === null) void refresh();
  }, [providers, refresh]);

  async function change(failureTitle: string, request: () => Promise<unknown>) {
    const changed = await attempt(failureTitle, async () => {
      await request();
      return true;
    });

    if (!changed) return false;

    await refresh();
    return true;
  }

  async function create(input: NewProvider) {
    const created = await change("Could not add provider", () =>
      postJson<Provider>("/providers", input),
    );

    if (created) toast.add({ title: "Provider added", description: input.name, type: "success" });

    return created;
  }

  async function listModels(input: Pick<NewProvider, "kind" | "apiKey" | "baseUrl">) {
    return postJson<ListedModels>("/providers/models", input);
  }

  async function update(provider: Provider, patch: ProviderPatch) {
    const updated = await change("Could not update provider", () =>
      postJson<Provider>(`/providers/${provider.id}`, patch, "PATCH"),
    );

    if (updated)
      toast.add({ title: "Provider updated", description: provider.name, type: "success" });

    return updated;
  }

  async function listSavedModels(provider: Provider) {
    return api<ListedModels>(`/providers/${provider.id}/models`);
  }

  async function makeDefault(provider: Provider) {
    const updated = await change("Could not update provider", () =>
      postJson<Provider>(`/providers/${provider.id}`, { isDefault: true }, "PATCH"),
    );

    if (updated) {
      toast.add({ title: "Default provider changed", description: provider.name, type: "success" });
    }
  }

  async function remove(provider: Provider) {
    const removed = await change("Could not remove provider", () =>
      api<{ ok: true }>(`/providers/${provider.id}`, { method: "DELETE" }),
    );

    if (removed) toast.add({ title: "Provider removed", description: provider.name });
  }

  return {
    providers: providers ?? [],
    loaded: providers !== null,
    refresh,
    create,
    listModels,
    listSavedModels,
    update,
    makeDefault,
    remove,
  };
}
