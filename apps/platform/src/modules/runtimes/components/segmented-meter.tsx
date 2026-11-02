import { cn } from "cn";

import { filledSegments, METER_HIGH } from "../machine-metrics";

const SEGMENTS = 28;

// A bar of thin upright segments that fill from the left, as a dial of how full something is.
// `percent` null is a reading the machine could not give: an empty bar, not a full one.
export function SegmentedMeter({ label, percent }: { label: string; percent: number | null }) {
  const filled = filledSegments(percent, SEGMENTS);
  const fill = percent !== null && percent >= METER_HIGH ? "bg-destructive" : "bg-meter";
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent ?? undefined}
      aria-valuetext={percent === null ? "unknown" : `${percent}%`}
      className="flex h-7 items-stretch gap-[2px]"
    >
      {Array.from({ length: SEGMENTS }, (_, index) => (
        <span
          key={index}
          data-filled={index < filled ? "" : undefined}
          className={cn("min-w-0 flex-1 rounded-[1px]", index < filled ? fill : "bg-muted")}
        />
      ))}
    </div>
  );
}
