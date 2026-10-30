import { Slider } from "@/components/slider";

type Props = {
  levels: string[];
  value: string;
  onChange: (level: string) => void;
};

// One step per level the model accepts, lowest on the left, with the levels named underneath.
export function EffortSlider({ levels, value, onChange }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Reasoning effort</span>
        <span className="font-medium capitalize">{value}</span>
      </div>
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
      <div className="flex justify-between text-[0.7rem] text-muted-foreground capitalize">
        {levels.map((level) => (
          <span key={level} className={level === value ? "text-foreground" : undefined}>
            {level}
          </span>
        ))}
      </div>
    </div>
  );
}
