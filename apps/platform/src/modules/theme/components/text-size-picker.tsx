import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/select";

import { useTextSize } from "../hooks/use-text-size";
import { TEXT_SIZES } from "../types";
import type { TextSize, TextSizeScope } from "../types";

export function TextSizePicker({ scope, label }: { scope: TextSizeScope; label: string }) {
  const { size, setSize } = useTextSize(scope);

  return (
    <Select value={size} onValueChange={(value) => value && setSize(value as TextSize)}>
      <SelectTrigger aria-label={label}>
        <SelectValue>
          {(value: TextSize) => TEXT_SIZES.find((option) => option.id === value)?.label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="w-auto min-w-(--anchor-width)">
        {TEXT_SIZES.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
