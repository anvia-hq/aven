import { EffortTrack } from "@aven/ui/effort-track";

type Props = {
  levels: string[];
  value: string;
  onChange: (level: string) => void;
};

const NAMES: Record<string, string> = { xhigh: "Extra high" };

export function effortName(level: string) {
  const name = NAMES[level] ?? level;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function EffortSlider({ levels, value, onChange }: Props) {
  return (
    <div className="flex flex-col gap-2.5">
      <EffortTrack
        max={levels.length - 1}
        value={Math.max(levels.indexOf(value), 0)}
        marks={levels}
        onValueChange={(index) => {
          const level = levels[index];

          if (level) onChange(level);
        }}
        getAriaValueText={(_formatted, index) => levels[index] ?? ""}
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        {levels.map((level) => (
          <span key={level} className={level === value ? "font-medium text-foreground" : undefined}>
            {effortName(level)}
          </span>
        ))}
      </div>
    </div>
  );
}
