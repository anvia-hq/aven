import { createFileRoute, redirect } from "@tanstack/react-router";

import { SettingsPage } from "@/components/settings-section";
import { api } from "@/lib/api";
import { GithubSection } from "@/modules/platform/components/github-section";
import { RegistrationSection } from "@/modules/platform/components/registration-section";
import type { PlatformConfig } from "@/modules/platform/types";

export const Route = createFileRoute("/_authed/settings/platform")({
  beforeLoad: async () => {
    const config = await api<PlatformConfig>("/platform/config");
    if (!config.isOwner) throw redirect({ to: "/settings/general" });
  },
  component: Platform,
});

function Platform() {
  return (
    <SettingsPage title="Platform" description="Settings for the whole installation.">
      <RegistrationSection />
      <GithubSection />
    </SettingsPage>
  );
}
