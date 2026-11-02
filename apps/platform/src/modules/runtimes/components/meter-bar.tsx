import { METER_HIGH } from "../machine-metrics";

// A thin bar that fills from the left to `percent`; nothing for a reading the machine could not give.
export function MeterBar({ percent }: { percent: number | null }) {
  const high = percent !== null && percent >= METER_HIGH;
  return (
    <span aria-hidden className="block h-[3px] w-full overflow-hidden rounded-full bg-muted">
      <span
        data-slot="meter-fill"
        data-high={high ? "" : undefined}
        className={high ? "block h-full bg-destructive" : "block h-full bg-meter"}
        style={{ width: `${percent ?? 0}%` }}
      />
    </span>
  );
}
