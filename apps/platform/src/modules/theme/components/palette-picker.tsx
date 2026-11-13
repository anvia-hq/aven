import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@aven/ui/select";

import { useTheme } from "../hooks/use-theme";
import { PALETTES } from "../types";
import type { Palette } from "../types";

export function PalettePicker() {
  const { palette, setPalette } = useTheme();

  return (
    <Select value={palette} onValueChange={(value) => value && setPalette(value as Palette)}>
      <SelectTrigger aria-label="Theme">
        <SelectValue>
          {(value: Palette) => PALETTES.find((option) => option.id === value)?.label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="w-auto min-w-(--anchor-width)">
        {PALETTES.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
