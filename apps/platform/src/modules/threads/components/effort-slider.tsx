import { Slider as SliderPrimitive } from "@base-ui/react/slider";

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

const THUMB = "size-9";

export function EffortSlider({ levels, value, onChange }: Props) {
  const last = Math.max(levels.length - 1, 1);
  return (
    <div className="flex flex-col gap-2.5">
      <SliderPrimitive.Root
        min={0}
        max={levels.length - 1}
        step={1}
        thumbAlignment="edge"
        value={[Math.max(levels.indexOf(value), 0)]}
        onValueChange={(next) => {
          const level = levels[Array.isArray(next) ? (next[0] ?? 0) : next];
          if (level) onChange(level);
        }}
      >
        <SliderPrimitive.Control className="relative flex h-9 w-full touch-none items-center select-none">
          <SliderPrimitive.Track className="relative h-6 w-full grow overflow-hidden rounded-full border bg-muted/50 select-none">
            <SliderPrimitive.Indicator className="h-full rounded-full bg-linear-to-r from-effort/25 to-effort" />
          </SliderPrimitive.Track>
          <div aria-hidden className="pointer-events-none absolute inset-x-4.5 inset-y-0">
            {levels.map((level, index) => (
              <span
                key={level}
                className="absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground/60"
                style={{ left: `${(index / last) * 100}%` }}
              />
            ))}
          </div>
          <SliderPrimitive.Thumb
            getAriaLabel={() => "Reasoning effort"}
            getAriaValueText={(_formatted, index) => levels[index] ?? ""}
            className={`${THUMB} rounded-full bg-foreground shadow-md ring-ring/50 outline-hidden transition-shadow focus-visible:ring-3`}
          />
        </SliderPrimitive.Control>
      </SliderPrimitive.Root>
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
