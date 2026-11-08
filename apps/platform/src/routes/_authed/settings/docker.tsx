import { createFileRoute, redirect } from "@tanstack/react-router";

import { SettingsPage } from "@/components/settings-section";
import { api } from "@/lib/api";
import { LeftoversSection } from "@/modules/platform/components/leftovers-section";
import type { PlatformConfig } from "@/modules/platform/types";

export const Route = createFileRoute("/_authed/settings/docker")({
  beforeLoad: async () => {
    const config = await api<PlatformConfig>("/platform/config");
    if (!config.isOwner) throw redirect({ to: "/settings/general" });
  },
  component: Docker,
});

function Docker() {
  return (
    <SettingsPage
      title="Docker"
      description="Containers and images Aven left on each runner's machine that nothing uses any more: stopped sandboxes, expired environment snapshots, sandbox images of older releases and untagged images."
    >
      <LeftoversSection />
    </SettingsPage>
  );
}
