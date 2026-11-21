import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "@aven/ui/settings-section";
import { GithubSection } from "@/modules/platform/components/github-section";
import { LensSection } from "@/modules/platform/components/lens-section";
import { RegistrationSection } from "@/modules/platform/components/registration-section";
import { ServerModelsSection } from "@/modules/platform/components/server-models-section";
import { usePlatformConfig } from "@/modules/platform/hooks/use-platform-config";
import { requireOwnerSettings } from "@/modules/platform/require-owner-settings";

export const Route = createFileRoute("/_authed/settings/platform")({
  beforeLoad: requireOwnerSettings,
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
