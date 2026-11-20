import { createFileRoute, redirect } from "@tanstack/react-router";

import { SettingsPage } from "@/components/settings-section";
import { api } from "@/lib/api";
import { GithubSection } from "@/modules/platform/components/github-section";
import { LensSection } from "@/modules/platform/components/lens-section";
import { ServerModelsSection } from "@/modules/platform/components/server-models-section";
import { RegistrationSection } from "@/modules/platform/components/registration-section";
import { usePlatformConfig } from "@/modules/platform/hooks/use-platform-config";
import type { PlatformConfig } from "@/modules/platform/types";

export const Route = createFileRoute("/_authed/settings/platform")({
  beforeLoad: async () => {
    const config = await api<PlatformConfig>("/platform/config");

    if (!config.isOwner || config.platformSettings === false) {
      throw redirect({ to: "/settings/general" });
    }
  },
  component: Platform,
});

function Platform() {
  const { config } = usePlatformConfig();

  return (
    <SettingsPage title="Installation" description="Settings for the whole installation.">
      <RegistrationSection />
      <ServerModelsSection />
      <GithubSection />
      {config?.lens && <LensSection />}
    </SettingsPage>
  );
}
