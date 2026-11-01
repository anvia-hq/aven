import { SettingsRow, SettingsSection } from "@/components/settings-section";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/select";
import { Switch } from "@/components/switch";

import { useTheme } from "@/modules/theme/hooks/use-theme";

import { useTimezone } from "../hooks/use-timezone";

// Every timezone this browser knows, with the person's own in the list whatever it is.
const zones = (current: string) => {
  const all = Intl.supportedValuesOf("timeZone");
  return all.includes(current) ? all : [current, ...all];
};

export function PreferencesSection() {
  const { theme, setTheme } = useTheme();
  const { timezone, save } = useTimezone();

  return (
    <>
      <SettingsSection title="Appearance" description="Only affects this device.">
        <SettingsRow title="Dark mode" description="Use the dark theme across the app.">
          <Switch
            aria-label="Dark mode"
            checked={theme === "dark"}
            onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
          />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Time" description="Follows you to every device.">
        <SettingsRow
          title="Timezone"
          description="The clock your bots use when you ask for something at a time, such as every morning."
        >
          <Select value={timezone} onValueChange={(value) => value && void save(String(value))}>
            <SelectTrigger aria-label="Timezone" className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {zones(timezone).map((zone) => (
                <SelectItem key={zone} value={zone}>
                  {zone}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>
      </SettingsSection>
    </>
  );
}
