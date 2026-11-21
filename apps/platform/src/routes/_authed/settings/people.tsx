import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "@aven/ui/settings-section";
import { PeopleSection } from "@/modules/platform/components/people-section";
import { requireOwnerSettings } from "@/modules/platform/require-owner-settings";

export const Route = createFileRoute("/_authed/settings/people")({
  beforeLoad: requireOwnerSettings,
  component: People,
});

function People() {
  return (
    <SettingsPage
      title="People"
      description="Every account on this installation, including people who are in none of your workspaces."
    >
      <PeopleSection />
    </SettingsPage>
  );
}
