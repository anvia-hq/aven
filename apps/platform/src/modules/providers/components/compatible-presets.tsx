import { Button } from "@/components/button";

import { COMPATIBLE_PRESETS, type CompatiblePreset } from "../presets";

type Props = {
  selected: CompatiblePreset | null;
  /** Called with the preset pressed, or null when the pressed one is let go. */
  onSelect: (preset: CompatiblePreset | null) => void;
};

// A row of well-known services for an OpenAI-compatible server: pressing one fills in its name and
// address, and pressing it again leaves the form to be filled by hand.
export function CompatiblePresets({ selected, onSelect }: Props) {
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span>Start from</span>
      <div role="group" aria-label="Presets" className="flex flex-wrap gap-1.5">
        {COMPATIBLE_PRESETS.map((preset) => (
          <Button
            key={preset.id}
            type="button"
            size="xs"
            variant={selected?.id === preset.id ? "default" : "outline"}
            aria-pressed={selected?.id === preset.id}
            onClick={() => onSelect(selected?.id === preset.id ? null : preset)}
          >
            {preset.name}
          </Button>
        ))}
      </div>
    </div>
  );
}
