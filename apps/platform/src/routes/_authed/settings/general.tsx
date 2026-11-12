import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage, SettingsSection } from "@/components/settings-section";
import { PreferencesSection } from "@/modules/settings/components/preferences-section";
import { SmallModelsSection } from "@/modules/settings/components/small-models-section";
import { ProfileForm } from "@/modules/settings/components/profile-form";

export const Route = createFileRoute("/_authed/settings/general")({
  component: General,
});

function General() {
  const { user } = Route.useRouteContext();

  return (
    <SettingsPage title="General" description="Your personal account and preferences.">
      <SettingsSection title="Account" description="How you appear to others in this workspace.">
        <ProfileForm name={user.name} email={user.email} image={user.image ?? null} />
      </SettingsSection>
      <PreferencesSection />
      <SmallModelsSection />
    </SettingsPage>
  );
}
