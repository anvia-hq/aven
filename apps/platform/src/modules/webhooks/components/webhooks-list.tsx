import { Trash } from "@mynaui/icons-react";

import { Badge } from "@aven/ui/badge";
import { Button } from "@aven/ui/button";
import { Switch } from "@aven/ui/switch";
import { timeAgo } from "@/lib/format";

import { useWebhooks } from "../hooks/use-webhooks";
import type { Webhook } from "../types";

function lastDelivery(webhook: Webhook) {
  if (!webhook.lastDeliveryAt) return "No deliveries yet";

  const at = timeAgo(webhook.lastDeliveryAt, true);

  if (webhook.lastStatus === "delivered") return `Sent to your main bot ${at}`;

  if (webhook.lastStatus === "busy") return `Your main bot was busy ${at}`;

  return `Could not be sent ${at}`;
}

function WebhookRow({ webhook }: { webhook: Webhook }) {
  const { setEnabled, remove } = useWebhooks();

  return (
    <li className="flex items-start gap-3 border-b py-3 last:border-b-0">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{webhook.name}</span>
          {webhook.lastStatus === "failed" && <Badge variant="destructive">Failed</Badge>}
          {!webhook.enabled && <Badge variant="secondary">Off</Badge>}
        </div>
        <p className="truncate font-mono text-xs text-muted-foreground">/api{webhook.path}/…</p>
        <p className="text-xs text-muted-foreground">{lastDelivery(webhook)}</p>
      </div>
      <Switch
        size="sm"
        aria-label={`Use ${webhook.name}`}
        checked={webhook.enabled}
        onCheckedChange={(enabled) => void setEnabled(webhook, enabled)}
      />
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Remove ${webhook.name}`}
        onClick={() => void remove(webhook)}
      >
        <Trash />
      </Button>
    </li>
  );
}

export function WebhooksList() {
  const { webhooks, loaded } = useWebhooks();

  if (!loaded) return null;

  return (
    <div className="flex flex-col gap-8">
      {webhooks.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No webhooks yet. Make one for each service that should reach your main bot.
        </p>
      ) : (
        <ul aria-label="Webhooks" className="flex flex-col">
          {webhooks.map((webhook) => (
            <WebhookRow key={webhook.id} webhook={webhook} />
          ))}
        </ul>
      )}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">What happens to a delivery</h2>
        <p className="text-sm text-muted-foreground">
          Every delivery goes to your main bot, never to another bot and never straight into a
          thread. It identifies the source and looks up the matching project and related threads. If
          the report is incomplete or clearly not an issue, it says so and stops. If it needs
          verifying, it starts a thread in the right project whose only job is to reproduce or
          confirm the issue, and summarizes the result for you when that thread finishes. It does
          not ask for a patch or a pull request unless you say so.
        </p>
      </section>
    </div>
  );
}
