import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/select";

import { useTheme } from "../hooks/use-theme";
import { SANS_FONTS } from "../types";
import type { SansFont } from "../types";

export function FontPicker() {
  const { font, setFont } = useTheme();

  return (
    <Select value={font} onValueChange={(value) => value && setFont(value as SansFont)}>
      <SelectTrigger aria-label="Interface font" className="w-56">
        <SelectValue>
          {(value: SansFont) => SANS_FONTS.find((option) => option.id === value)?.label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {SANS_FONTS.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            <span style={{ fontFamily: option.family }}>{option.label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
