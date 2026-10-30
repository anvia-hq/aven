import { getDefaultStore, useAtom } from "jotai";
import { useEffect } from "react";

import { toast } from "@/components/toast";
import { api, attempt, postJson } from "@/lib/api";
import { createListStore } from "@/lib/list-store";

import { providerModelsAtom } from "../atoms/provider-models-atom";
import { providersAtom } from "../atoms/providers-atom";
import type { NewProvider, Provider, ProviderPatch } from "../types";

const providersStore = createListStore<Provider>({
  path: "/providers",
  atom: providersAtom,
  label: "providers",
});

// Providers belong to the signed-in user, so drop them (and the model lists fetched with their
// keys) on sign-out; the next user refetches.
export function resetProviders() {
  providersStore.reset();
  getDefaultStore().set(providerModelsAtom, {});
}

// The user's providers. Loads on first use; mutations refetch so defaults stay consistent.
export function useProviders() {
  const [providers] = useAtom(providersAtom);
  const { refresh } = providersStore;

  useEffect(() => {
    if (providers === null) void refresh();
  }, [providers, refresh]);

  // Runs a request that changes a provider and reloads the list; false on failure (already toasted).
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

  // Asks the provider which models the key can use. Null on failure (already toasted).
  function listModels(input: Pick<NewProvider, "kind" | "apiKey" | "baseUrl">) {
    return attempt("Could not load models", async () => {
      const result = await postJson<{ models: string[] }>("/providers/models", input);
      return result.models;
    });
  }

  async function update(provider: Provider, patch: ProviderPatch) {
    const updated = await change("Could not update provider", () =>
      postJson<Provider>(`/providers/${provider.id}`, patch, "PATCH"),
    );
    if (updated)
      toast.add({ title: "Provider updated", description: provider.name, type: "success" });
    return updated;
  }

  // The models a saved provider offers, asked of its stored key. Null on failure (already toasted).
  function listSavedModels(provider: Provider) {
    return attempt(
      "Could not load models",
      async () => (await api<{ models: string[] }>(`/providers/${provider.id}/models`)).models,
    );
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
    create,
    listModels,
    listSavedModels,
    update,
    makeDefault,
    remove,
  };
}
