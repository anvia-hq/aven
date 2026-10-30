import { SettingsRow, SettingsSection } from "@/components/settings-section";
import { Switch } from "@/components/switch";

import { useTheme } from "@/modules/theme/hooks/use-theme";

export function PreferencesSection() {
  const { theme, setTheme } = useTheme();

  return (
    <SettingsSection title="Appearance" description="Only affects this device.">
      <SettingsRow title="Dark mode" description="Use the dark theme across the app.">
        <Switch
          aria-label="Dark mode"
          checked={theme === "dark"}
          onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
        />
      </SettingsRow>
    </SettingsSection>
  );
}
