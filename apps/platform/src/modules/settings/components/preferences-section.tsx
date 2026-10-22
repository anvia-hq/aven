import { useState } from "react";

import { Switch } from "@/components/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/toggle-group";

import { useTheme } from "@/modules/theme/hooks/use-theme";
import { MODES, type Mode } from "@/modules/threads/types";

export function PreferencesSection() {
  const { theme, setTheme } = useTheme();
  const [mode, setMode] = useState<Mode>("smart");

  return (
    <section aria-label="Preferences" className="flex max-w-md flex-col gap-4">
      <h2 className="text-lg font-semibold">Preferences</h2>
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col">
          <span className="text-sm font-medium">Dark mode</span>
          <span className="text-xs text-muted-foreground">Use the dark theme across the app.</span>
        </div>
        <Switch
          aria-label="Dark mode"
          checked={theme === "dark"}
          onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
        />
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col">
          <span className="text-sm font-medium">Default mode</span>
          <span className="text-xs text-muted-foreground">Used for new threads.</span>
        </div>
        <ToggleGroup
          aria-label="Default mode"
          value={[mode]}
          onValueChange={(next) => next[0] && setMode(next[0] as Mode)}
          size="sm"
          spacing={1}
        >
          {MODES.map((item) => (
            <ToggleGroupItem key={item.value} value={item.value}>
              {item.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </section>
  );
}
