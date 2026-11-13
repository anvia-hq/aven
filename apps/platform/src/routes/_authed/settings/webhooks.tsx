import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "@/components/settings-section";
import { WebhookDialog } from "@/modules/webhooks/components/webhook-dialog";
import { WebhooksList } from "@/modules/webhooks/components/webhooks-list";

export const Route = createFileRoute("/_authed/settings/webhooks")({
  component: Webhooks,
});

function Webhooks() {
  return (
    <SettingsPage
      title="Webhooks"
      description="Get reports from other services to your main bot. It decides what each one needs, and starts a thread only when the issue must be verified."
      actions={<WebhookDialog />}
    >
      <WebhooksList />
    </SettingsPage>
  );
}
