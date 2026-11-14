import { Slider as SliderPrimitive } from "@base-ui/react/slider";

type Props = {
  max: number;
  value: number;
  marks: string[];
  onValueChange: (index: number) => void;
  getAriaValueText: (formatted: string, index: number) => string;
};

export function EffortTrack({ max, value, marks, onValueChange, getAriaValueText }: Props) {
  const last = Math.max(marks.length - 1, 1);
  return (
    <SliderPrimitive.Root
      min={0}
      max={max}
      step={1}
      thumbAlignment="edge"
      value={[value]}
      onValueChange={(next) => onValueChange(Array.isArray(next) ? (next[0] ?? 0) : next)}
    >
      <SliderPrimitive.Control className="relative flex h-9 w-full touch-none items-center select-none">
        <SliderPrimitive.Track className="relative h-6 w-full grow overflow-hidden rounded-full border bg-muted/50 select-none">
          <SliderPrimitive.Indicator className="h-full rounded-full bg-linear-to-r from-effort/25 to-effort" />
        </SliderPrimitive.Track>
        <div aria-hidden className="pointer-events-none absolute inset-x-4.5 inset-y-0">
          {marks.map((level, index) => (
            <span
              key={level}
              className="absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground/60"
              style={{ left: `${(index / last) * 100}%` }}
            />
          ))}
        </div>
        <SliderPrimitive.Thumb
          getAriaLabel={() => "Reasoning effort"}
          getAriaValueText={getAriaValueText}
          className="size-9 rounded-full bg-foreground shadow-md ring-ring/50 outline-hidden transition-shadow focus-visible:ring-3"
        />
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}
