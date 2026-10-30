import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "@/components/settings-section";
import { ProvidersList } from "@/modules/settings/components/providers-list";

export const Route = createFileRoute("/_authed/settings/providers")({
  component: Providers,
});

function Providers() {
  return (
    <SettingsPage
      title="Providers"
      description="The models your threads run on. They belong to you, not to a workspace; the default one is used when you send a message."
    >
      <ProvidersList />
    </SettingsPage>
  );
}
