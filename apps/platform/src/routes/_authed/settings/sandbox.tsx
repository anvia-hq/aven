import { createFileRoute, redirect } from "@tanstack/react-router";

import { SettingsPage } from "@/components/settings-section";
import { api } from "@/lib/api";
import { CloudLifecycleSection } from "@/modules/platform/components/cloud-lifecycle-section";
import { SandboxSection } from "@/modules/platform/components/sandbox-section";
import type { PlatformConfig } from "@/modules/platform/types";

export const Route = createFileRoute("/_authed/settings/sandbox")({
  beforeLoad: async () => {
    const config = await api<PlatformConfig>("/platform/config");

    if (!config.isOwner) throw redirect({ to: "/settings/general" });
  },
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
