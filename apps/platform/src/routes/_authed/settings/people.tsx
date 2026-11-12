import { createFileRoute, redirect } from "@tanstack/react-router";

import { SettingsPage } from "@/components/settings-section";
import { api } from "@/lib/api";
import { PeopleSection } from "@/modules/platform/components/people-section";
import type { PlatformConfig } from "@/modules/platform/types";

export const Route = createFileRoute("/_authed/settings/people")({
  beforeLoad: async () => {
    const config = await api<PlatformConfig>("/platform/config");

    if (!config.isOwner) throw redirect({ to: "/settings/general" });
  },
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
