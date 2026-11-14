import { useState } from "react";

import { SettingsRow, SettingsSection } from "@/components/settings-section";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@aven/ui/select";
import { Switch } from "@aven/ui/switch";

import { finishedSoundOn, playChime, setFinishedSound } from "@/lib/chime";
import { FontPicker } from "@/modules/theme/components/font-picker";
import { ModePicker } from "@/modules/theme/components/mode-picker";
import { PalettePicker } from "@/modules/theme/components/palette-picker";
import { TextSizePicker } from "@/modules/theme/components/text-size-picker";

import { useTimezone } from "../hooks/use-timezone";

const zones = (current: string) => {
  const all = Intl.supportedValuesOf("timeZone");
  return all.includes(current) ? all : [current, ...all];
};

export function PreferencesSection() {
  const { timezone, save } = useTimezone();
  const [sound, setSound] = useState(finishedSoundOn);

  return (
    <>
      <SettingsSection title="Appearance" description="Only affects this device.">
        <SettingsRow
          title="Theme"
          description="The colors of the app. Each has a light and a dark mode."
        >
          <PalettePicker />
        </SettingsRow>
        <SettingsRow
          title="Interface font"
          description="The font for the app's text. Code keeps its monospace font."
        >
          <FontPicker />
        </SettingsRow>
        <SettingsRow
          title="Interface text size"
          description="The size of the app's text, everywhere."
        >
          <TextSizePicker scope="interface" label="Interface text size" />
        </SettingsRow>
        <SettingsRow
          title="Thread text size"
          description="The size of an agent's conversation in a thread, on top of the interface size."
        >
          <TextSizePicker scope="thread" label="Thread text size" />
        </SettingsRow>
        <SettingsRow
          title="Bot chat text size"
          description="The size of the conversation with a bot, on top of the interface size."
        >
          <TextSizePicker scope="bot" label="Bot chat text size" />
        </SettingsRow>
        <SettingsRow title="Mode" description="Light, dark, or whichever this device is set to.">
          <ModePicker />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Sound" description="Only affects this device.">
        <SettingsRow
          title="Sounds"
          description="A soft chime when an agent finishes while you are in another tab or window, and a quieter note when someone mentions you."
        >
          <Switch
            aria-label="Sounds"
            checked={sound}
            onCheckedChange={(checked) => {
              setSound(checked);
              setFinishedSound(checked);

              if (checked) playChime();
            }}
          />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Time" description="Follows you to every device.">
        <SettingsRow
          title="Timezone"
          description="The clock your bots use when you ask for something at a time, such as every morning."
        >
          <Select value={timezone} onValueChange={(value) => value && void save(String(value))}>
            <SelectTrigger aria-label="Timezone">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="w-auto min-w-(--anchor-width)">
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
