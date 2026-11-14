import { cn } from "cn";

import { Progress } from "@aven/ui/progress";
import { resetsIn } from "@/lib/format";

import { OverviewCard } from "./overview-card";
import type { PlanLimit, PlanLimitWindow } from "@aven/protocol/types";

const ROWS: { window: PlanLimitWindow; label: string }[] = [
  { window: "five_hour", label: "5-hour" },
  { window: "seven_day", label: "Weekly" },
];

export function LimitsCard({ limits }: { limits: PlanLimit[] | undefined }) {
  const rows = ROWS.flatMap((row) => {
    const limit = limits?.find((item) => item.window === row.window);

    return limit ? [{ ...row, limit }] : [];
  });

  if (rows.length === 0) return null;

  return (
    <OverviewCard title="Limits">
      {rows.map(({ window, label, limit }) => {
        const percent = Math.round(limit.percent);
        return (
          <div key={window} className="flex flex-col gap-1">
            <div className="flex min-h-6 items-center justify-between gap-2">
              <span className="text-muted-foreground">{label}</span>
              <span
                className={cn(
                  limit.status === "allowed_warning" && "text-meter",
                  limit.status === "rejected" && "text-destructive",
                )}
              >
                {percent}% used
              </span>
            </div>
            <Progress
              value={limit.percent}
              aria-label={`${label} limit used`}
              className={cn(
                limit.status === "allowed_warning" && "[&_[data-slot=progress-indicator]]:bg-meter",
                limit.status === "rejected" && "[&_[data-slot=progress-indicator]]:bg-destructive",
              )}
            />
            {limit.resetsAt !== undefined && (
              <span className="text-xs text-muted-foreground">
                resets in {resetsIn(limit.resetsAt)}
              </span>
            )}
          </div>
        );
      })}
    </OverviewCard>
  );
}
