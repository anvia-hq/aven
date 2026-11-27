import { cn } from "cn";

import { resetsIn } from "@/lib/format";

import { OverviewBar } from "./overview-bar";
import { OverviewCard } from "./overview-card";
import type { PlanLimit, PlanLimitStatus, PlanLimitWindow } from "@aven/protocol/types";

const ROWS: { window: PlanLimitWindow; label: string }[] = [
  { window: "five_hour", label: "5-hour" },
  { window: "seven_day", label: "Weekly" },
];

const LIMIT_TONE: Record<PlanLimitStatus, string> = {
  allowed: "bg-foreground",
  allowed_warning: "bg-meter",
  rejected: "bg-destructive",
};

export function LimitsCard({ limits }: { limits: PlanLimit[] | undefined }) {
  const rows = ROWS.flatMap((row) => {
    const limit = limits?.find((item) => item.window === row.window);

    return limit ? [{ ...row, limit }] : [];
  });

  if (rows.length === 0) return null;

  return (
    <OverviewCard title="Limits">
      {rows.map(({ window, label, limit }) => {
        const clamped = Math.max(0, Math.min(100, limit.percent));
        const percent = Math.round(clamped);
        return (
          <div key={window} className="flex flex-col gap-1.5">
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
            <OverviewBar
              segments={[{ id: "used", value: clamped, tone: LIMIT_TONE[limit.status] }]}
              total={100}
              ariaLabel={`${label} limit used`}
              valueNow={clamped}
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
