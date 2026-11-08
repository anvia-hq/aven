import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/tooltip";
import { compactNumber } from "@/lib/format";

import { chartDate, heatmapWeeks, levelOf } from "../activity";
import type { ProfileDay } from "../types";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

const LEVELS = [
  "bg-muted",
  "bg-primary/20",
  "bg-primary/40",
  "bg-primary/65",
  "bg-primary",
] as const;

const CELL = 12;
const GAP = 4;
const CELL_STYLE = { width: CELL, height: CELL };
const GAP_STYLE = { gap: GAP };

type Props = {
  days: ProfileDay[];
  today: string;
};

export function ActivityHeatmap({ days, today }: Props) {
  const weeks = heatmapWeeks(days, today);
  const columns = `repeat(${weeks.length}, ${CELL}px)`;
  const most = Math.max(1, ...days.map((day) => day.tokens));

  return (
    <section aria-label="Activity" className="flex flex-col gap-4 border-t pt-8">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-medium">Activity</h2>
        <p className="text-xs text-muted-foreground">
          {days.length === 0 ? "No activity yet" : `${compactNumber(days.length)} days of work`}
        </p>
      </div>
      <div className="flex flex-col gap-1.5 overflow-x-auto pb-1">
        <div className="flex gap-2">
          <span className="w-2 shrink-0" />
          <div className="grid shrink-0" style={{ ...GAP_STYLE, gridTemplateColumns: columns }}>
            {weeks.map((week, index) => (
              <span
                key={week.cells[0]?.date ?? index}
                className="h-3 text-[10px] leading-3 whitespace-nowrap text-muted-foreground"
              >
                {week.label}
              </span>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <div
            className="grid w-2 shrink-0 text-[9px] leading-none text-muted-foreground"
            style={{ ...GAP_STYLE, gridTemplateRows: `repeat(7, ${CELL}px)` }}
          >
            {WEEKDAYS.map((weekday, index) => (
              <span key={index} className="flex items-center">
                {weekday}
              </span>
            ))}
          </div>
          <div
            className="grid shrink-0"
            style={{
              ...GAP_STYLE,
              gridTemplateColumns: columns,
              gridTemplateRows: `repeat(7, ${CELL}px)`,
              gridAutoFlow: "column",
            }}
          >
            {weeks.flatMap((week) =>
              week.cells.map((cell, row) =>
                cell === null ? (
                  <span key={`${week.cells[0]?.date}-${row}`} style={CELL_STYLE} />
                ) : (
                  <Tooltip key={cell.date}>
                    <TooltipTrigger
                      render={
                        <span
                          role="img"
                          aria-label={`${chartDate(cell.date)}: ${cell.tokens} tokens`}
                          style={CELL_STYLE}
                          className={`block rounded-[3px] transition-[box-shadow] hover:ring-1 hover:ring-foreground/25 ${
                            LEVELS[levelOf(cell.tokens, most)] ?? ""
                          }`}
                        />
                      }
                    />
                    <TooltipContent>
                      {cell.tokens === 0
                        ? `No tokens on ${chartDate(cell.date)}`
                        : `${compactNumber(cell.tokens)} tokens on ${chartDate(cell.date)}`}
                    </TooltipContent>
                  </Tooltip>
                ),
              ),
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 pl-4 text-[10px] text-muted-foreground">
        <span>Less</span>
        {LEVELS.map((level) => (
          <span key={level} className={`size-2.5 rounded-[2px] ${level}`} />
        ))}
        <span>More</span>
      </div>
    </section>
  );
}
