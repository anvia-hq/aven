import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/page-header";
import { Separator } from "@/components/separator";
import { DangerZone } from "@/modules/settings/components/danger-zone";
import { PreferencesSection } from "@/modules/settings/components/preferences-section";
import { ProfileForm } from "@/modules/settings/components/profile-form";

export const Route = createFileRoute("/_authed/settings/profile")({
  component: Profile,
});

function Profile() {
  const { user } = Route.useRouteContext();

  return (
    <>
      <PageHeader title="Profile" description="Your personal account and preferences." />
      <ProfileForm name={user.name} email={user.email} />
      <Separator />
      <PreferencesSection />
      <Separator />
      <DangerZone />
    </>
  );
}
