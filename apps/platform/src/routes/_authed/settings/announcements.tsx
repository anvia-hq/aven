import { createFileRoute, redirect } from "@tanstack/react-router";

import { SettingsPage } from "@/components/settings-section";
import { api } from "@/lib/api";
import { AnnouncementsSection } from "@/modules/announcements/components/announcements-section";
import type { PlatformConfig } from "@/modules/platform/types";

export const Route = createFileRoute("/_authed/settings/announcements")({
  beforeLoad: async () => {
    const config = await api<PlatformConfig>("/platform/config");

    if (!config.isOwner) throw redirect({ to: "/settings/general" });
  },
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
