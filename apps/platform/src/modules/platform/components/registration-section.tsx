import { SettingsRow, SettingsSection } from "@/components/settings-section";
import { Switch } from "@/components/switch";

import { usePlatformConfig } from "../hooks/use-platform-config";

export function RegistrationSection() {
  const { config, setRegistrationEnabled } = usePlatformConfig();

  return (
    <SettingsSection title="Registration" description="Who can create an account here.">
      <SettingsRow
        title="Allow new sign-ups"
        description="When off, only people with an invite link can create an account."
      >
        <Switch
          aria-label="Allow new sign-ups"
          disabled={!config}
          checked={config?.registrationEnabled ?? true}
          onCheckedChange={setRegistrationEnabled}
        />
      </SettingsRow>
    </SettingsSection>
  );
}
