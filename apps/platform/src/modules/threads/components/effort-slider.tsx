import { Slider } from "@/components/slider";

type Props = {
  levels: string[];
  value: string;
  onChange: (level: string) => void;
};

// One step per level the model accepts, lowest on the left. Nothing to choose with fewer than two.
export function EffortSlider({ levels, value, onChange }: Props) {
  if (levels.length < 2) return null;

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>Effort</span>
      <div className="w-24">
        <Slider
          min={0}
          max={levels.length - 1}
          step={1}
          value={[Math.max(levels.indexOf(value), 0)]}
          onValueChange={(next) => {
            const level = levels[Array.isArray(next) ? (next[0] ?? 0) : next];
            if (level) onChange(level);
          }}
          getAriaLabel={() => "Reasoning effort"}
          getAriaValueText={(_formatted, index) => levels[index] ?? ""}
        />
      </div>
      <span className="w-10 text-foreground">{value}</span>
    </div>
  );
}
