import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "@aven/ui/settings-section";
import { AnnouncementsSection } from "@/modules/announcements/components/announcements-section";
import { requireOwnerSettings } from "@/modules/platform/require-owner-settings";

export const Route = createFileRoute("/_authed/settings/announcements")({
  beforeLoad: requireOwnerSettings,
  component: Announcements,
});

function Announcements() {
  return (
    <SettingsPage
      title="Announcements"
      description="Show a card in every sidebar. Clicking it opens the details in a dialog people can dismiss."
    >
      <AnnouncementsSection />
    </SettingsPage>
  );
}
