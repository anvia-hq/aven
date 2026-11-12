import { useAtom } from "jotai";
import { useEffect } from "react";

import { toast } from "@/components/toast";
import { api, attempt, postJson } from "@/lib/api";
import { createListStore } from "@/lib/list-store";

import { accessTokensAtom } from "../atoms/access-tokens-atom";
import type { AccessToken, AccessTokenCreated, AccessTokenInput } from "../types";

const accessStore = createListStore<AccessToken>({
  path: "/mcp-access",
  atom: accessTokensAtom,
  label: "access tokens",
});

export function resetAccessTokens() {
  accessStore.reset();
}

export function useAccessTokens() {
  const [tokens] = useAtom(accessTokensAtom);
  const { refresh } = accessStore;

  useEffect(() => {
    if (tokens === null) void refresh();
  }, [tokens, refresh]);

  async function create(input: AccessTokenInput) {
    const created = await attempt("Could not create access token", () =>
      postJson<AccessTokenCreated>("/mcp-access", input),
    );

    if (created) await refresh();

    return created;
  }

  async function remove(token: AccessToken) {
    const removed = await attempt("Could not remove access token", async () => {
      await api<{ ok: true }>(`/mcp-access/${token.id}`, { method: "DELETE" });
      return true;
    });

    if (!removed) return;

    await refresh();
    toast.add({ title: "Access token removed", description: token.name });
  }

  return { tokens: tokens ?? [], loaded: tokens !== null, create, remove };
}
