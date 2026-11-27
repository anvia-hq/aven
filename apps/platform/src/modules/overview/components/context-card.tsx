import { Button } from "@aven/ui/button";
import { Skeleton } from "@aven/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@aven/ui/tooltip";
import { compactNumber } from "@/lib/format";
import { ESTIMATE_HINT, FREE_SPACE_HINT, contextBars } from "../context-bars";
import { HintedRow } from "./hinted-row";
import { OverviewBar } from "./overview-bar";
import { OverviewCard } from "./overview-card";
import type { ContextUsage } from "@aven/protocol/types";

const COMPACT_FROM_PERCENT = 25;

export function ContextCard({
  context,
  loading,
  onCompact,
}: {
  context: ContextUsage | undefined;
  loading: boolean;
  onCompact?: { run: () => void; busy: boolean; disabled: boolean };
}) {
  if (loading) {
    return (
      <OverviewCard title="Context">
        <Skeleton className="h-2 w-full rounded-full" />
        <div className="flex flex-col gap-0.5">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-4 w-16" />
        </div>
      </OverviewCard>
    );
  }

  if (!context) return null;

  if (!context.contextWindow) {
    return (
      <OverviewCard title="Context">
        <div className="flex min-h-6 items-center justify-between gap-2">
          <span>{compactNumber(context.usedTokens)} tokens</span>
          <span className="text-xs text-muted-foreground">in context</span>
        </div>
        <p className="text-xs text-muted-foreground">Model size unknown</p>
      </OverviewCard>
    );
  }

  const percent = Math.min(100, (context.usedTokens / context.contextWindow) * 100);
  const split = contextBars(context);
  const segments = split
    ? split.bars.map((bar) => ({ id: bar.id, value: bar.percent, tone: bar.tone }))
    : [{ id: "used", value: percent, tone: "bg-foreground" }];
  return (
    <OverviewCard title="Context">
      <OverviewBar segments={segments} total={100} ariaLabel="Context used" valueNow={percent} />
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span>{percent < 1 ? "<1" : Math.round(percent)}% used</span>
          <Tooltip>
            <TooltipTrigger
              render={
                <span tabIndex={0} className="w-fit cursor-default text-xs text-muted-foreground" />
              }
            >
              {compactNumber(context.usedTokens)} / {compactNumber(context.contextWindow)}
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-64">
              {`${context.usedTokens.toLocaleString("en")} of ${context.contextWindow.toLocaleString("en")} tokens: the size of the last request, which holds the whole conversation so far. It is not a total across runs.`}
            </TooltipContent>
          </Tooltip>
        </div>
        {onCompact && percent >= COMPACT_FROM_PERCENT && (
          <Button
            variant="outline"
            size="xs"
            className="rounded-full"
            disabled={onCompact.busy || onCompact.disabled}
            onClick={onCompact.run}
          >
            {onCompact.busy ? "Compacting…" : "Compact"}
          </Button>
        )}
      </div>
      {split && (
        <dl className="flex flex-col gap-1 text-xs">
          {split.bars.map((bar) => (
            <HintedRow
              key={bar.id}
              label={bar.label}
              value={compactNumber(bar.tokens)}
              hint={`${bar.hint} ${bar.tokens.toLocaleString("en")} tokens. ${ESTIMATE_HINT}`}
              marker={<span aria-hidden className={`size-2 shrink-0 rounded-full ${bar.tone}`} />}
            />
          ))}
          <HintedRow
            label="Free space"
            value={compactNumber(split.free)}
            hint={`${FREE_SPACE_HINT} ${split.free.toLocaleString("en")} tokens.`}
            marker={
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full border border-foreground/30"
              />
            }
          />
        </dl>
      )}
    </OverviewCard>
  );
}
