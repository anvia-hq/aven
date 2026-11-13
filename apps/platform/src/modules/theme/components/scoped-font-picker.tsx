import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/select";

import { useScopedFont } from "../hooks/use-scoped-font";
import { INHERIT_FONT, SANS_FONTS } from "../types";
import type { FontChoice, FontScope } from "../types";

const INHERIT_LABEL = "Same as interface font";

const labelOf = (choice: FontChoice) =>
  choice === INHERIT_FONT
    ? INHERIT_LABEL
    : SANS_FONTS.find((option) => option.id === choice)?.label;

export function ScopedFontPicker({ scope, label }: { scope: FontScope; label: string }) {
  const { choice, setChoice } = useScopedFont(scope);

  return (
    <Select value={choice} onValueChange={(value) => value && setChoice(value as FontChoice)}>
      <SelectTrigger aria-label={label}>
        <SelectValue>{(value: FontChoice) => labelOf(value)}</SelectValue>
      </SelectTrigger>
      <SelectContent className="w-auto min-w-(--anchor-width)">
        <SelectItem value={INHERIT_FONT}>{INHERIT_LABEL}</SelectItem>
        {SANS_FONTS.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            <span style={{ fontFamily: option.family }}>{option.label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
