import { useAtom } from "jotai";
import { useEffect } from "react";

import { toast } from "@/components/toast";
import { api, attempt, postJson } from "@/lib/api";
import { createListStore } from "@/lib/list-store";

import { webhooksAtom } from "../atoms/webhooks-atom";
import type { Webhook, WebhookCreated } from "../types";

const webhookStore = createListStore<Webhook>({
  path: "/webhooks",
  atom: webhooksAtom,
  label: "webhooks",
});

export function resetWebhooks() {
  webhookStore.reset();
}

export function useWebhooks() {
  const [webhooks] = useAtom(webhooksAtom);
  const { refresh } = webhookStore;

  useEffect(() => {
    if (webhooks === null) void refresh();
  }, [webhooks, refresh]);

  async function create(name: string) {
    const created = await attempt("Could not make the webhook", () =>
      postJson<WebhookCreated>("/webhooks", { name }),
    );

    if (created) await refresh();

    return created;
  }

  async function setEnabled(webhook: Webhook, enabled: boolean) {
    const changed = await attempt("Could not change the webhook", () =>
      postJson<Webhook>(`/webhooks/${webhook.id}`, { enabled }, "PATCH"),
    );

    if (changed) await refresh();
  }

  async function remove(webhook: Webhook) {
    const removed = await attempt("Could not remove the webhook", async () => {
      await api<{ ok: true }>(`/webhooks/${webhook.id}`, { method: "DELETE" });
      return true;
    });

    if (!removed) return;

    await refresh();
    toast.add({ title: "Webhook removed", description: webhook.name });
  }

  return { webhooks: webhooks ?? [], loaded: webhooks !== null, create, setEnabled, remove };
}
