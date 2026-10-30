import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage, SettingsSection } from "@/components/settings-section";
import { PreferencesSection } from "@/modules/settings/components/preferences-section";
import { ProfileForm } from "@/modules/settings/components/profile-form";

export const Route = createFileRoute("/_authed/settings/profile")({
  component: Profile,
});

function Profile() {
  const { user } = Route.useRouteContext();

  return (
    <SettingsPage title="Profile" description="Your personal account and preferences.">
      <SettingsSection title="Account" description="How you appear to others in this workspace.">
        <ProfileForm name={user.name} email={user.email} />
      </SettingsSection>
      <PreferencesSection />
    </SettingsPage>
  );
}
