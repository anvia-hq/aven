import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "@/components/settings-section";
import { BotsSettingsList } from "@/modules/bots/components/bots-settings-list";

export const Route = createFileRoute("/_authed/settings/bots")({
  component: Bots,
});

function Bots() {
  return (
    <SettingsPage
      title="Bots"
      description="The model each of your bots talks with. A bot with no model of its own uses your default provider."
    >
      <BotsSettingsList />
    </SettingsPage>
  );
}
