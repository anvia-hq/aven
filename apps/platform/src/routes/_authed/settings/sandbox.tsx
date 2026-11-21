import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "@aven/ui/settings-section";
import { CloudLifecycleSection } from "@/modules/platform/components/cloud-lifecycle-section";
import { SandboxSection } from "@/modules/platform/components/sandbox-section";
import { requireOwnerSettings } from "@/modules/platform/require-owner-settings";

export const Route = createFileRoute("/_authed/settings/sandbox")({
  beforeLoad: requireOwnerSettings,
  component: Sandbox,
});

function Sandbox() {
  return (
    <SettingsPage
      title="Sandbox"
      description="The platform that runs Aven Cloud computers. The whole installation uses one: boat.dev or a spaces server."
    >
      <SandboxSection />
      <CloudLifecycleSection />
    </SettingsPage>
  );
}
