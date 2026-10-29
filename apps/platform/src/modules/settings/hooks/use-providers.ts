import { getDefaultStore, useAtom } from "jotai";
import { useCallback, useEffect } from "react";

import { toast } from "@/components/toast";
import { ApiError, api, postJson } from "@/lib/api";

import { providerModelsAtom } from "../atoms/provider-models-atom";
import { providersAtom } from "../atoms/providers-atom";
import type { NewProvider, Provider } from "../types";

// Providers belong to the signed-in user, so drop them on sign-out; the next user refetches.
export function clearProviders() {
  getDefaultStore().set(providersAtom, null);
  getDefaultStore().set(providerModelsAtom, {});
}

const messageOf = (failure: unknown) =>
  failure instanceof ApiError ? failure.message : "Could not reach the server";

// The user's providers. Loads on first use; mutations refetch so defaults stay consistent.
export function useProviders() {
  const [providers, setProviders] = useAtom(providersAtom);

  const refresh = useCallback(async () => {
    try {
      setProviders(await api<Provider[]>("/providers"));
    } catch (failure) {
      toast.add({
        title: "Could not load providers",
        description: messageOf(failure),
        type: "error",
      });
      setProviders((current) => current ?? []);
    }
  }, [setProviders]);

  useEffect(() => {
    if (providers === null) void refresh();
  }, [providers, refresh]);

  async function create(input: NewProvider) {
    try {
      await postJson<Provider>("/providers", input);
    } catch (failure) {
      toast.add({
        title: "Could not add provider",
        description: messageOf(failure),
        type: "error",
      });
      return false;
    }
    await refresh();
    toast.add({ title: "Provider added", description: input.name, type: "success" });
    return true;
  }

  // Asks the provider which models the key can use. Null on failure (already toasted).
  async function listModels(input: Pick<NewProvider, "kind" | "apiKey" | "baseUrl">) {
    try {
      const result = await postJson<{ models: string[] }>("/providers/models", input);
      return result.models;
    } catch (failure) {
      toast.add({
        title: "Could not load models",
        description: messageOf(failure),
        type: "error",
      });
      return null;
    }
  }

  async function makeDefault(provider: Provider) {
    try {
      await postJson<Provider>(`/providers/${provider.id}`, { isDefault: true }, "PATCH");
    } catch (failure) {
      toast.add({
        title: "Could not update provider",
        description: messageOf(failure),
        type: "error",
      });
      return;
    }
    await refresh();
    toast.add({ title: "Default provider changed", description: provider.name, type: "success" });
  }

  async function remove(provider: Provider) {
    try {
      await api<{ ok: true }>(`/providers/${provider.id}`, { method: "DELETE" });
    } catch (failure) {
      toast.add({
        title: "Could not remove provider",
        description: messageOf(failure),
        type: "error",
      });
      return;
    }
    await refresh();
    toast.add({ title: "Provider removed", description: provider.name });
  }

  return {
    providers: providers ?? [],
    loaded: providers !== null,
    create,
    listModels,
    makeDefault,
    remove,
  };
}
