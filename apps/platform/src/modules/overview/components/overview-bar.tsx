import { cn } from "cn";

import type { BarSegment } from "../types";

const TRACK_TONE = "bg-foreground/10";

export function OverviewBar({
  segments,
  total,
  ariaLabel,
  valueNow,
}: {
  segments: readonly BarSegment[];
  total?: number;
  ariaLabel?: string;
  valueNow?: number;
}) {
  const parts = segments.filter((segment) => segment.value > 0);
  const sum = parts.reduce((acc, segment) => acc + segment.value, 0);

  if (total !== undefined) {
    const remaining = Math.max(0, total - sum);

    if (remaining > 0 || parts.length === 0) {
      parts.push({ id: "remaining", value: remaining > 0 ? remaining : total, tone: TRACK_TONE });
    }
  }

  if (parts.length === 0) {
    parts.push({ id: "empty", value: 1, tone: TRACK_TONE });
  }

  return (
    <div
      role={ariaLabel ? "progressbar" : undefined}
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
      aria-valuemin={ariaLabel ? 0 : undefined}
      aria-valuemax={ariaLabel ? 100 : undefined}
      aria-valuenow={ariaLabel && valueNow !== undefined ? Math.round(valueNow) : undefined}
      className="flex h-2 w-full items-center gap-1"
    >
      {parts.map((part) => (
        <span
          key={part.id}
          className={cn(
            "h-full min-w-2 rounded-full transition-[flex-grow] duration-200 motion-reduce:transition-none",
            part.tone,
          )}
          style={{ flexGrow: part.value, flexBasis: 0 }}
        />
      ))}
    </div>
  );
}
