import { createFileRoute, redirect } from "@tanstack/react-router";

import { PageHeader } from "@/components/page-header";
import { api } from "@/lib/api";
import { RegistrationSection } from "@/modules/platform/components/registration-section";
import type { PlatformConfig } from "@/modules/platform/types";

export const Route = createFileRoute("/_authed/settings/platform")({
  beforeLoad: async () => {
    const config = await api<PlatformConfig>("/platform/config");
    if (!config.isOwner) throw redirect({ to: "/settings/profile" });
  },
  component: Platform,
});

function Platform() {
  return (
    <>
      <PageHeader title="Platform" description="Settings for the whole installation." />
      <RegistrationSection />
    </>
  );
}
