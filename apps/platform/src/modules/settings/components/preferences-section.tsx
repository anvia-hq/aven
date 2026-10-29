import { Switch } from "@/components/switch";

import { useTheme } from "@/modules/theme/hooks/use-theme";

export function PreferencesSection() {
  const { theme, setTheme } = useTheme();

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
    </section>
  );
}
