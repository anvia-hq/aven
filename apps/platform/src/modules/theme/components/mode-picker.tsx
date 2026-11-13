import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@aven/ui/select";

import { useTheme } from "../hooks/use-theme";
import { THEMES } from "../types";
import type { Theme } from "../types";

export function ModePicker() {
  const { theme, setTheme } = useTheme();

  return (
    <Select value={theme} onValueChange={(value) => value && setTheme(value as Theme)}>
      <SelectTrigger aria-label="Mode">
        <SelectValue>
          {(value: Theme) => THEMES.find((option) => option.id === value)?.label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="w-auto min-w-(--anchor-width)">
        {THEMES.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
